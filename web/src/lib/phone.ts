export function loginPhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) return `+228${digits}`;
  if (digits.length === 11 && digits.startsWith("228")) return `+${digits}`;
  return trimmed.replace(/[\s().-]/g, "");
}
