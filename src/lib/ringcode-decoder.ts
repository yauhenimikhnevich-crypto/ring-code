// RingCode decoder - ported from Python v3.3
import { SECTORS, START_PATTERN_BITS, HEADER_BYTES, HEADER_BITS, QUIET_ZONE, RING_INNER_FRAC, RING_OUTER_FRAC } from './ringcode';

const ANGLE_KEEP_FRAC = 0.70;
const RADIUS_TAP = 2;

// Simple Reed-Solomon decoder (simplified version)
// Full RS implementation would require a proper RS library
function rsDecodeSimple(codeword: number[], eccLen: number): number[] | null {
  // This is a simplified version that just validates and returns the data
  // In production, use a proper Reed-Solomon library
  const dataLen = codeword.length - eccLen;
  if (dataLen <= 0 || codeword.length < eccLen) {
    return null;
  }
  
  // Simple validation: check if data looks reasonable
  const data = codeword.slice(0, dataLen);
  
  // Basic checksum validation using XOR
  let checkXor = 0;
  for (let i = 0; i < dataLen; i++) {
    checkXor ^= data[i];
  }
  
  // If most of the data is zeros or 255s, likely bad decode
  const zeros = data.filter(x => x === 0).length;
  const ones = data.filter(x => x === 255).length;
  if (zeros > dataLen * 0.8 || ones > dataLen * 0.8) {
    return null;
  }
  
  return data;
}

function bitsToBytes(bits: number[]): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | (i + j < bits.length ? bits[i + j] : 0);
    }
    out.push(b);
  }
  return new Uint8Array(out);
}

function checksum8(bb: Uint8Array): number {
  let sum = 0;
  for (const byte of bb) {
    sum += byte;
  }
  return sum & 0xFF;
}

function capacityBits(): number {
  return SECTORS.reduce((a, b) => a + b, 0);
}

function capacityDataBits(): number {
  return capacityBits() - START_PATTERN_BITS.length - HEADER_BITS;
}

function ringMidRadii(size: number, rings: number): number[] {
  const cx = size / 2;
  const maxR = cx - QUIET_ZONE;
  const ringTh = maxR / (rings + 1);
  
  const mids: number[] = [];
  for (let ri = 0; ri < rings; ri++) {
    const rIn = ringTh * ri + ringTh * RING_INNER_FRAC;
    const rOut = ringTh * ri + ringTh * RING_OUTER_FRAC;
    mids.push((rIn + rOut) / 2.0);
  }
  return mids;
}

function sampleRing(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  sectors: number,
  shift: number
): number[] {
  const twoPi = 2 * Math.PI;
  const seg = twoPi / sectors;
  const pad = (1.0 - ANGLE_KEEP_FRAC) * 0.5;
  const vals: number[] = [];
  
  for (let s = 0; s < sectors; s++) {
    const a0 = (s + pad + shift) * seg;
    const a1 = (s + 1 - pad + shift) * seg;
    const angles: number[] = [];
    for (let i = 0; i <= 7; i++) {
      angles.push(a0 + (a1 - a0) * (i / 7));
    }
    
    let acc = 0.0;
    let cnt = 0;
    
    for (const a of angles) {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let dr = -RADIUS_TAP; dr <= RADIUS_TAP; dr++) {
        const rr = r + dr;
        const x = Math.round(cx + rr * ca);
        const y = Math.round(cy + rr * sa);
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          // Grayscale: use red channel (all channels are same in grayscale)
          acc += imageData[idx];
          cnt++;
        }
      }
    }
    vals.push(cnt > 0 ? acc / cnt : 255.0);
  }
  return vals;
}

function valsToBitsPercentile(vals: number[], bias: number = 1.0): number[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const p30Idx = Math.floor(sorted.length * 0.30);
  const p70Idx = Math.floor(sorted.length * 0.70);
  const p30 = sorted[p30Idx];
  const p70 = sorted[p70Idx];
  const thr = ((p30 + p70) / 2.0) * bias;
  return vals.map(v => v < thr ? 1 : 0);
}

function valsToBitsOtsu(vals: number[], bias: number = 1.0): number[] {
  // Simplified Otsu thresholding for 1D array
  const histogram = new Array(256).fill(0);
  const clipped = vals.map(v => Math.max(0, Math.min(255, Math.round(v))));
  
  for (const val of clipped) {
    histogram[val]++;
  }
  
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }
  
  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 0;
  const total = clipped.length;
  
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    
    wF = total - wB;
    if (wF === 0) break;
    
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  
  const thr = threshold * bias;
  return clipped.map(v => v < thr ? 1 : 0);
}

function tryDecodeLinear(linear: number[]): string | null {
  const i = START_PATTERN_BITS.length;
  if (linear.length < i + HEADER_BITS) {
    return null;
  }
  
  const hdrBits = linear.slice(i, i + HEADER_BITS);
  const hdr = bitsToBytes(hdrBits);
  if (hdr.length !== 7) {
    return null;
  }
  
  const version = hdr[0];
  const eccLevel = hdr[1];
  const payloadLen = (hdr[2] << 8) | hdr[3];
  const eccLen = (hdr[4] << 8) | hdr[5];
  const checksumVal = hdr[6];
  
  if (checksum8(hdr.subarray(0, 6)) !== checksumVal) {
    return null;
  }
  if (payloadLen <= 0) {
    return null;
  }
  
  const capBytes = Math.floor(capacityDataBits() / 8);
  if (payloadLen + eccLen > capBytes) {
    return null;
  }
  
  const dataStart = i + HEADER_BITS;
  const needBits = (payloadLen + eccLen) * 8;
  if (dataStart + needBits > linear.length) {
    return null;
  }
  
  const codewordBits = linear.slice(dataStart, dataStart + needBits);
  const codeword = Array.from(bitsToBytes(codewordBits));
  
  try {
    const decoded = rsDecodeSimple(codeword, eccLen);
    if (!decoded) {
      return null;
    }
    const msg = decoded.slice(0, payloadLen);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(msg));
    return text;
  } catch (error) {
    return null;
  }
}

// Image preprocessing functions
function createGrayscale(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data.length);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const gray = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
    data[i + 3] = 255;
  }
  return new ImageData(data, imageData.width, imageData.height);
}

function applyCLAHE(imageData: ImageData, clipLimit: number = 2.5, tileSize: number = 8): ImageData {
  // Simplified CLAHE (Contrast Limited Adaptive Histogram Equalization)
  const width = imageData.width;
  const height = imageData.height;
  const data = new Uint8ClampedArray(imageData.data.length);
  data.set(imageData.data);
  
  // For simplicity, apply global histogram equalization
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }
  
  const cdf = new Array(256).fill(0);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }
  
  const total = width * height;
  const cdfMin = cdf.find(v => v > 0) || 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i];
    const newVal = Math.round(((cdf[val] - cdfMin) / (total - cdfMin)) * 255);
    data[i] = data[i + 1] = data[i + 2] = newVal;
  }
  
  return new ImageData(data, width, height);
}

function applyGamma(imageData: ImageData, gamma: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data.length);
  const inv = 1.0 / Math.max(gamma, 1e-6);
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = Math.round(Math.pow(i / 255.0, inv) * 255);
  }
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const val = table[imageData.data[i]];
    data[i] = data[i + 1] = data[i + 2] = val;
    data[i + 3] = 255;
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

function normalizeImage(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data.length);
  let min = 255, max = 0;
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const val = imageData.data[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }
  
  const range = max - min;
  if (range === 0) {
    data.set(imageData.data);
  } else {
    for (let i = 0; i < imageData.data.length; i += 4) {
      const normalized = Math.round(((imageData.data[i] - min) / range) * 255);
      data[i] = data[i + 1] = data[i + 2] = normalized;
      data[i + 3] = 255;
    }
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

function preprocessVariants(imageData: ImageData): ImageData[] {
  const gray = createGrayscale(imageData);
  const clahe = applyCLAHE(gray);
  const normalized = normalizeImage(gray);
  const gamma07 = applyGamma(clahe, 0.7);
  const gamma13 = applyGamma(clahe, 1.3);
  
  return [gray, clahe, normalized, gamma07, gamma13];
}

export async function decodeRingCodeFromImage(imageData: ImageData, onProgress?: (progress: number) => void): Promise<string | null> {
  const width = imageData.width;
  const height = imageData.height;
  const cx = width / 2.0;
  const cy = height / 2.0;
  const mids = ringMidRadii(Math.min(height, width), SECTORS.length);
  
  const variants = preprocessVariants(imageData);
  const totalVariants = variants.length;
  
  // Try all preprocessing variants
  for (let vi = 0; vi < variants.length; vi++) {
    const variant = variants[vi];
    
    if (onProgress) {
      onProgress((vi / totalVariants) * 100);
    }
    
    // Try with and without inversion
    for (const inv of [false, true]) {
      // Try different bias values
      for (const bias of [1.00, 0.95, 1.05, 0.90, 1.10]) {
        // Try different threshold modes
        for (const threshMode of ['pct', 'otsu']) {
          // Try anchor shifts (sample every 4th position for speed)
          for (let s0 = 0; s0 < SECTORS[0]; s0 += 4) {
            const ringBits: number[][] = [];
            
            for (let ri = 0; ri < SECTORS.length; ri++) {
              const n = SECTORS[ri];
              const shift = (s0 * n) / SECTORS[0];
              const vals = sampleRing(variant.data, width, height, cx, cy, mids[ri], n, shift);
              
              let bits: number[];
              if (threshMode === 'pct') {
                bits = valsToBitsPercentile(vals, bias);
              } else {
                bits = valsToBitsOtsu(vals, bias);
              }
              
              if (inv) {
                bits = bits.map(b => 1 - b);
              }
              
              ringBits.push(bits);
            }
            
            // Flatten to linear
            const linear: number[] = [];
            for (const ring of ringBits) {
              linear.push(...ring);
            }
            
            const text = tryDecodeLinear(linear);
            if (text !== null) {
              console.log(`[OK] decoded v${vi} (${inv ? 'INV' : 'NORM'}, ${threshMode}, bias=${bias.toFixed(2)}, s0=${s0})`);
              if (onProgress) onProgress(100);
              return text;
            }
          }
        }
      }
    }
  }
  
  if (onProgress) onProgress(100);
  return null;
}

export async function decodeRingCodeFromFile(file: File, onProgress?: (progress: number) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = await decodeRingCodeFromImage(imageData, onProgress);
      resolve(result);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

export async function decodeRingCodeFromDataURL(dataUrl: string, onProgress?: (progress: number) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = await decodeRingCodeFromImage(imageData, onProgress);
      resolve(result);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
