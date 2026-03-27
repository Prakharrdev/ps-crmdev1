export function cn(...inputs: (string | boolean | undefined | null | string[])[]) {
  return inputs
    .flat()
    .filter((v) => typeof v === 'string' && v.length > 0)
    .join(' ');
}
