import { customAlphabet } from 'nanoid';

// 6 字符 base32(去掉容易混淆的 0/O/1/I/L)— 32^6 ≈ 1e9
export const newShareId = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 6);
