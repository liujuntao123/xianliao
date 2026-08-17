/**
 * Hono 应用：与平台无关的核心路由。
 *
 * 鉴权：除 /api/health 外全部要求 Authorization: Bearer <ACCESS_KEY>。
 * 若 ACCESS_KEY 未设置，一律 503（部署未完成，不泄露任何信息）。
 */
import { Hono } from 'hono';
import { AppError, type AppConfig } from './types';
import { safeEqual, sealState, unsealState } from './crypto';
import { FeishuClient, forgetTokenCache } from './feishu/client';
import { beginRegistration, pollRegistration } from './feishu/device-flow';
import {
  createBaseWithSchema,
  forgetDiscoveredCache,
  resolveBaseToken,
} from './feishu/base';
import { forgetSchemaCache, getSchema } from './feishu/schema';
import { Repo } from './repo';

export function createApp(config: AppConfig): Hono {
  const app = new Hono();

  // ---------- 错误归一化 ----------
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, ...err.payload }, err.status as 400);
    }
    console.error('[xianji] unhandled error:', err);
    return c.json({ error: '服务器内部错误' }, 500);
  });

  // ---------- 健康检查（无鉴权，容器探活用） ----------
  app.get('/api/health', (c) => c.json({ ok: true }));

  // ---------- ACCESS_KEY 未设置：整体拒绝 ----------
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/health') return next();
    if (!config.accessKey) {
      throw new AppError(503, '尚未设置 ACCESS_KEY 环境变量，请先完成部署配置');
    }
    await next();
  });

  // ---------- Bearer 鉴权 ----------
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/health') return next();
    const auth = c.req.header('Authorization') ?? '';
    const m = /^Bearer\s+(.+)$/.exec(auth);
    if (!m || !(await safeEqual(m[1]!, config.accessKey))) {
      return c.json({ error: '密钥无效' }, 401);
    }
    await next();
  });

  const feishuCreds = () =>
    new FeishuClient({
      appId: config.feishuAppId,
      appSecret: config.feishuAppSecret,
      domain: config.feishuDomain,
    });

  const hasAppCreds = () => config.feishuAppId !== '' && config.feishuAppSecret !== '';

  // ---------- 首启向导 ----------

  app.get('/api/setup/status', async (c) => {
    const status = {
      accessKeySet: config.accessKey !== '',
      feishu: {
        appIdSet: config.feishuAppId !== '',
        appSecretSet: config.feishuAppSecret !== '',
        baseTokenSet: config.feishuBaseToken !== '',
      },
      domain: config.feishuDomain,
    } as Record<string, unknown>;

    if (hasAppCreds()) {
      try {
        const client = feishuCreds();
        await client.getTenantToken();
        const baseToken = await resolveBaseToken(client, config.feishuAppId, config.feishuBaseToken);
        await getSchema(client, config.feishuAppId, baseToken);
        status.base = { ok: true, token: baseToken };
      } catch (e) {
        status.base = {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
          ...(e instanceof AppError ? e.payload : {}),
        };
      }
    }
    return c.json(status);
  });

  /** 发起扫码：返回二维码 URL + 密封句柄。 */
  app.post('/api/setup/scan/start', async (c) => {
    const domain = config.feishuDomain;
    const begin = await beginRegistration(domain);
    const handle = await sealState(config.accessKey, {
      deviceCode: begin.deviceCode,
      domain: begin.domain,
      interval: begin.interval,
      expiresAt: begin.expiresAt,
    });
    return c.json({
      qrUrl: begin.qrUrl,
      handle,
      interval: begin.interval,
      expiresIn: Math.floor((begin.expiresAt - Date.now()) / 1000),
    });
  });

  /** 轮询扫码状态。成功时同请求内完成建 Base+表+共享，返回环境变量值。 */
  app.post('/api/setup/scan/poll', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { handle?: string };
    if (!body.handle) throw new AppError(400, '缺少 handle');
    const state = await unsealState(config.accessKey, body.handle);

    const result = await pollRegistration(state.domain, state.deviceCode);

    if (result.status === 'error') {
      return c.json({
        status: 'error',
        code: result.errorCode,
        message: friendlyFlowError(result.errorCode, result.errorMessage),
      });
    }

    // 租户品牌切换（feishu → lark）：换域名继续轮询
    if (result.status === 'pending' && result.domainSwitched) {
      const newHandle = await sealState(config.accessKey, { ...state, domain: result.domainSwitched });
      return c.json({ status: 'pending', handle: newHandle, domainSwitched: result.domainSwitched });
    }

    if (result.status === 'pending') {
      return c.json({ status: 'pending', interval: state.interval });
    }

    // success：同请求内完成初始化
    const s = result.success!;
    return c.json(await initializeWithCredentials(s.appId, s.appSecret, s.openId, s.brand));
  });

  /**
   * 初始化重试（扫码成功但初始化失败时，前端持凭证重试）。
   * 无 body（或不带凭证）时，使用已配置的环境变量凭证——支持「手动路径配好
   * 应用后，一键用该应用创建数据表」。
   */
  app.post('/api/setup/init', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      appId?: string;
      appSecret?: string;
      openId?: string;
      domain?: string;
    };
    const appId = body.appId || config.feishuAppId;
    const appSecret = body.appSecret || config.feishuAppSecret;
    if (!appId || !appSecret) {
      throw new AppError(400, '缺少 appId/appSecret（body 未提供且环境变量未配置应用凭证）');
    }
    return c.json(
      await initializeWithCredentials(appId, appSecret, body.openId, config.feishuDomain),
    );
  });

  /**
   * 用给定凭证完成初始化：建 Base + 表结构 + full_access 共享。
   * 返回向导最终展示的环境变量值。初始化部分失败时凭证仍返回，附带
   * initError 与重试入口，前端可调 /api/setup/init 重试。
   */
  async function initializeWithCredentials(
    appId: string,
    appSecret: string,
    openId: string | undefined,
    brand: 'feishu' | 'lark',
  ) {
    const domain = brand === 'lark' ? 'lark' : config.feishuDomain;
    const client = new FeishuClient({ appId, appSecret, domain });
    const env = {
      FEISHU_APP_ID: appId,
      FEISHU_APP_SECRET: appSecret,
      FEISHU_BASE_TOKEN: '',
      FEISHU_DOMAIN: domain,
    };
    try {
      const init = await createBaseWithSchema(client, openId);
      env.FEISHU_BASE_TOKEN = init.baseToken;
      return {
        status: 'success',
        env,
        baseName: init.baseName,
        sharedTo: init.sharedTo,
      };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const payload: Record<string, unknown> = e instanceof AppError ? { ...e.payload } : {};
      // 建表最常见失败：应用未开通 bitable:app 权限（飞书泛化为 2200 等错误）。
      // 补直达开发者后台「权限管理」的链接，向导可渲染「去开通权限」入口。
      if (!payload.consoleUrl) {
        const host = domain === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
        payload.consoleUrl = `${host}/app/${appId}/safe`;
      }
      const feishuCode = (payload.feishu as { code?: number } | undefined)?.code;
      const message =
        feishuCode === 2200
          ? '创建多维表格被飞书拒绝（2200）：请确认应用已开通 bitable:app 权限，且已发布版本使权限生效'
          : err.message;
      return {
        status: 'success',
        env,
        initError: {
          message,
          ...payload,
        },
      };
    }
  }

  function friendlyFlowError(code?: string, msg?: string): string {
    switch (code) {
      case 'access_denied':
        return '你拒绝了授权，可重新发起扫码';
      case 'expired_token':
        return '二维码已过期，请重新发起扫码';
      default:
        return `扫码流程出错：${msg ?? code ?? '未知'}`;
    }
  }

  // ---------- 数据面（要求飞书凭证可用） ----------

  function requireRepo(): Repo {
    if (!hasAppCreds()) {
      throw new AppError(409, '尚未配置飞书应用凭证，请完成首启向导');
    }
    return new Repo(feishuCreds(), config.feishuAppId, config.feishuBaseToken);
  }

  app.get('/api/data', async (c) => {
    const repo = requireRepo();
    return c.json(await repo.getAll());
  });

  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined);

  /** 标签数组校验：trim、去重、去空；非数组返回 undefined（不更新）。 */
  const tags = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out: string[] = [];
    for (const item of v) {
      if (typeof item !== 'string') continue;
      const t = item.trim().slice(0, 50);
      if (t && !out.includes(t)) out.push(t);
    }
    if (out.length > 20) throw new AppError(400, '标签最多 20 个');
    return out;
  };

  // 清单
  app.post('/api/lists', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const name = str(body.name);
    if (!name) throw new AppError(400, '清单名称不能为空');
    return c.json(await requireRepo().createList(name));
  });
  app.patch('/api/lists/:id', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const name = str(body.name);
    if (!name) throw new AppError(400, '清单名称不能为空');
    await requireRepo().renameList(c.req.param('id'), name);
    return c.json({ ok: true });
  });
  app.delete('/api/lists/:id', async (c) => {
    await requireRepo().deleteList(c.req.param('id'));
    return c.json({ ok: true });
  });

  // 任务
  app.post('/api/tasks', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      listId?: string;
      title?: string;
      description?: string;
      dueDate?: number | null;
      tags?: unknown;
    };
    const title = str(body.title);
    if (!title) throw new AppError(400, '任务标题不能为空');
    if (!body.listId) throw new AppError(400, '缺少所属清单');
    await requireRepo().createTask({
      listId: body.listId,
      title,
      description: typeof body.description === 'string' ? body.description : '',
      dueDate: body.dueDate ?? null,
      tags: tags(body.tags) ?? [],
    });
    return c.json({ ok: true }, 201);
  });
  app.patch('/api/tasks/:id', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      description?: string;
      completed?: boolean;
      dueDate?: number | null;
      tags?: unknown;
      listId?: string;
    };
    const taskTags = tags(body.tags);
    await requireRepo().updateTask(c.req.param('id'), {
      title: body.title,
      description: body.description,
      completed: body.completed,
      dueDate: body.dueDate,
      listId: body.listId,
      ...(taskTags !== undefined ? { tags: taskTags } : {}),
    });
    return c.json({ ok: true });
  });
  app.delete('/api/tasks/:id', async (c) => {
    await requireRepo().deleteTask(c.req.param('id'));
    return c.json({ ok: true });
  });

  // 子任务
  app.post('/api/subtasks', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { taskId?: string; title?: string };
    const title = str(body.title);
    if (!title) throw new AppError(400, '子任务标题不能为空');
    if (!body.taskId) throw new AppError(400, '缺少所属任务');
    await requireRepo().createSubtask(body.taskId, title);
    return c.json({ ok: true }, 201);
  });
  app.patch('/api/subtasks/:id', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { title?: string; completed?: boolean };
    await requireRepo().updateSubtask(c.req.param('id'), body);
    return c.json({ ok: true });
  });
  app.delete('/api/subtasks/:id', async (c) => {
    await requireRepo().deleteSubtask(c.req.param('id'));
    return c.json({ ok: true });
  });

  // 笔记
  app.post('/api/notes', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      content?: string;
      tags?: unknown;
    };
    const title = str(body.title);
    if (!title) throw new AppError(400, '笔记标题不能为空');
    await requireRepo().createNote(
      title,
      typeof body.content === 'string' ? body.content : '',
      tags(body.tags) ?? [],
    );
    return c.json({ ok: true }, 201);
  });
  app.patch('/api/notes/:id', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      content?: string;
      tags?: unknown;
    };
    const noteTags = tags(body.tags);
    await requireRepo().updateNote(c.req.param('id'), {
      title: body.title,
      content: body.content,
      ...(noteTags !== undefined ? { tags: noteTags } : {}),
    });
    return c.json({ ok: true });
  });
  app.delete('/api/notes/:id', async (c) => {
    await requireRepo().deleteNote(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: '接口不存在' }, 404);
    return c.text('Not Found', 404);
  });

  return app;
}

/** 测试/运维辅助：清空各类实例缓存。 */
export function resetCaches(): void {
  forgetTokenCache();
  forgetDiscoveredCache();
  forgetSchemaCache();
}
