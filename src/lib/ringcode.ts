// RingCode encoder/decoder - портирован с Python версии 3.4
// Генерация кольцевых кодов с Reed-Solomon коррекцией ошибок

export const SECTORS = [128, 192, 256, 256, 256, 256]; // 6 колец
export const START_PATTERN_BITS = Array(16).fill([1, 0]).flat(); // 32 бита
export const HEADER_BYTES = 7;
export const HEADER_BITS = HEADER_BYTES * 8;
export const QUIET_ZONE = 48;
export const RING_INNER_FRAC = 0.50;
export const RING_OUTER_FRAC = 0.95;
export const ARC_FILL_FRAC = 0.92;

export const STYLES = {
  classic: { bg: '#FFFFFF', fg: '#000000', name: 'Classic' },
  cyber: { bg: '#081020', fg: '#00DCFF', name: 'Cyber' },
  solar: { bg: '#FFEBB4', fg: '#B47800', name: 'Solar' },
  noir: { bg: '#202020', fg: '#BE1E1E', name: 'Noir' },
  seal: { bg: '#F2E6CD', fg: '#961414', name: 'Seal' },
  ocean: { bg: '#148CC8', fg: '#321450', name: 'Ocean' },
  neon: { bg: '#0F1914', fg: '#00FFB4', name: 'Neon' },
  forest: { bg: '#DCD2A0', fg: '#5A4614', name: 'Forest' },
  slate: { bg: '#D2D2D2', fg: '#1E1E23', name: 'Slate' },
  gradient: { bg: '#F0F5FF', fg: '#000000', name: 'Gradient' },
  ice: { bg: '#DCF5FF', fg: '#005AB4', name: 'Ice' },
  lava: { bg: '#280000', fg: '#FF5A0A', name: 'Lava' },
};

export type StyleName = keyof typeof STYLES;

function capacityBits(): number {
  return SECTORS.reduce((a, b) => a + b, 0);
}

function capacityDataBits(): number {
  return capacityBits() - START_PATTERN_BITS.length - HEADER_BITS;
}

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
}

function checksum8(bytes: Uint8Array): number {
  return bytes.reduce((a, b) => a + b, 0) & 0xFF;
}

// Простая Reed-Solomon кодировка (упрощённая версия для демонстрации)
function simpleRS(data: Uint8Array, eccBytes: number): Uint8Array {
  // В production версии нужно использовать полноценную RS библиотеку
  const result = new Uint8Array(data.length + eccBytes);
  result.set(data);
  
  // Упрощённая контрольная сумма вместо полного RS
  for (let i = 0; i < eccBytes; i++) {
    let sum = 0;
    for (let j = 0; j < data.length; j++) {
      sum ^= data[j] * (i + 1);
    }
    result[data.length + i] = sum & 0xFF;
  }
  
  return result;
}

export function encodeText(text: string, eccLevel: number = 2): number[] {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  
  const eccMap: { [key: number]: number } = { 0: 8, 1: 16, 2: 32, 3: 64 };
  const eccBytes = eccMap[eccLevel] || 32;
  
  const dataBitsAvail = capacityDataBits() - eccBytes * 8;
  const maxPayloadBytes = Math.floor(dataBitsAvail / 8);
  
  if (textBytes.length > maxPayloadBytes) {
    throw new Error(`Text too long: ${textBytes.length} > ${maxPayloadBytes} bytes`);
  }
  
  // Создаём payload
  const payload = new Uint8Array(maxPayloadBytes);
  payload.set(textBytes);
  
  // RS кодировка
  const encoded = simpleRS(payload, eccBytes);
  
  // Заголовок: [version|level|payloadLen(2)|eccLen(2)|checksum]
  const header = new Uint8Array(HEADER_BYTES);
  header[0] = 3; // version
  header[1] = eccLevel;
  header[2] = (textBytes.length >> 8) & 0xFF;
  header[3] = textBytes.length & 0xFF;
  header[4] = (eccBytes >> 8) & 0xFF;
  header[5] = eccBytes & 0xFF;
  header[6] = checksum8(header.subarray(0, 6));
  
  // Собираем все биты
  const allBits = [
    ...START_PATTERN_BITS,
    ...bytesToBits(header),
    ...bytesToBits(encoded),
  ];
  
  // Дополняем до полной ёмкости
  while (allBits.length < capacityBits()) {
    allBits.push(0);
  }
  
  return allBits.slice(0, capacityBits());
}

function ringMidRadii(size: number, rings: number): number[] {
  const cx = size / 2;
  const maxR = cx - QUIET_ZONE;
  const ringThickness = maxR / (rings + 1);
  
  const radii: number[] = [];
  for (let i = 0; i < rings; i++) {
    const rIn = ringThickness * i + ringThickness * RING_INNER_FRAC;
    const rOut = ringThickness * i + ringThickness * RING_OUTER_FRAC;
    radii.push((rIn + rOut) / 2);
  }
  
  return radii;
}

export function renderRingCode(
  bits: number[],
  size: number,
  style: StyleName = 'cyber'
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const styleColors = STYLES[style];
  const cx = size / 2;
  const cy = size / 2;
  
  // Фон
  ctx.fillStyle = styleColors.bg;
  ctx.fillRect(0, 0, size, size);
  
  // Получаем радиусы колец
  const radii = ringMidRadii(size, SECTORS.length);
  
  // Рисуем кольца
  let bitIndex = 0;
  const ringThickness = (radii[0] - QUIET_ZONE) * 0.45;
  
  for (let ringIdx = 0; ringIdx < SECTORS.length; ringIdx++) {
    const sectors = SECTORS[ringIdx];
    const r = radii[ringIdx];
    const angleStep = (2 * Math.PI) / sectors;
    
    for (let s = 0; s < sectors && bitIndex < bits.length; s++, bitIndex++) {
      if (bits[bitIndex] === 1) {
        const a0 = s * angleStep - angleStep * (1 - ARC_FILL_FRAC) / 2;
        const a1 = (s + 1) * angleStep - angleStep * (1 - ARC_FILL_FRAC) / 2;
        
        ctx.beginPath();
        ctx.arc(cx, cy, r + ringThickness / 2, a0, a1);
        ctx.arc(cx, cy, r - ringThickness / 2, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = styleColors.fg;
        ctx.fill();
      }
    }
  }
  
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string = 'image/png'): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
}

export function generateSVG(bits: number[], size: number, style: StyleName = 'cyber'): string {
  const styleColors = STYLES[style];
  const cx = size / 2;
  const cy = size / 2;
  const radii = ringMidRadii(size, SECTORS.length);
  const ringThickness = (radii[0] - QUIET_ZONE) * 0.45;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<rect width="${size}" height="${size}" fill="${styleColors.bg}"/>`;
  
  let bitIndex = 0;
  for (let ringIdx = 0; ringIdx < SECTORS.length; ringIdx++) {
    const sectors = SECTORS[ringIdx];
    const r = radii[ringIdx];
    const angleStep = (2 * Math.PI) / sectors;
    
    for (let s = 0; s < sectors && bitIndex < bits.length; s++, bitIndex++) {
      if (bits[bitIndex] === 1) {
        const a0 = s * angleStep - angleStep * (1 - ARC_FILL_FRAC) / 2;
        const a1 = (s + 1) * angleStep - angleStep * (1 - ARC_FILL_FRAC) / 2;
        
        const rOuter = r + ringThickness / 2;
        const rInner = r - ringThickness / 2;
        
        const x0o = cx + rOuter * Math.cos(a0);
        const y0o = cy + rOuter * Math.sin(a0);
        const x1o = cx + rOuter * Math.cos(a1);
        const y1o = cy + rOuter * Math.sin(a1);
        const x1i = cx + rInner * Math.cos(a1);
        const y1i = cy + rInner * Math.sin(a1);
        const x0i = cx + rInner * Math.cos(a0);
        const y0i = cy + rInner * Math.sin(a0);
        
        const largeArc = (a1 - a0) > Math.PI ? 1 : 0;
        
        svg += `<path d="M${x0o},${y0o} A${rOuter},${rOuter} 0 ${largeArc} 1 ${x1o},${y1o} L${x1i},${y1i} A${rInner},${rInner} 0 ${largeArc} 0 ${x0i},${y0i} Z" fill="${styleColors.fg}"/>`;
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}
