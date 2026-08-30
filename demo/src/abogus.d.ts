declare module "./lib/abogus" {
  export function sign_datail(params: string, userAgent: string): string;
  export function sign_reply(params: string, userAgent: string): string;
}
