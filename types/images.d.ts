declare module 'utif' {
  export type Ifd = {
    width: number;
    height: number;
    t256?: number[];
    t257?: number[];
    t258?: number[];
    t259?: number[];
    t262?: number[];
    t277?: number[];
    t284?: number[];
    t339?: number[];
    data?: Uint8Array;
    isLE?: boolean;
    [key: string]: unknown;
  };

  export type UtifApi = {
    decode(buffer: ArrayBuffer): Ifd[];
    decodeImage(buffer: ArrayBuffer, ifd: Ifd): void;
    toRGBA8(ifd: Ifd): Uint8Array;
  };

  export function decode(buffer: ArrayBuffer): Ifd[];
  export function decodeImage(buffer: ArrayBuffer, ifd: Ifd): void;
  export function toRGBA8(ifd: Ifd): Uint8Array;
  const api: UtifApi;
  export default api;
}
