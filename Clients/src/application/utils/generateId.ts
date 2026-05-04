export const generateId = (): string => {
  const array = new Uint8Array(7);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 9);
};
