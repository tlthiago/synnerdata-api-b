export function wrapSuccess<T>(data: T): { success: true; data: T } {
  return { success: true as const, data };
}

export function wrapSuccessWithMessage<T>(
  data: T,
  message: string
): { success: true; data: T; message: string } {
  return { success: true as const, data, message };
}
