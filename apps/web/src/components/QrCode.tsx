import { useMemo } from 'react';
import { encode } from 'uqr';

/** 纯 SVG 二维码（uqr 生成矩阵，零依赖渲染） */
export function QrCode({ text, size = 208 }: { text: string; size?: number }) {
  const matrix = useMemo(() => encode(text), [text]);
  const cells: React.ReactElement[] = [];
  const n = matrix.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix.data[y * n + x]) {
        cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
      }
    }
  }
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      className="rounded-lg bg-white p-2 shadow-sm"
      shapeRendering="crispEdges"
    >
      <g fill="#0f172a">{cells}</g>
    </svg>
  );
}
