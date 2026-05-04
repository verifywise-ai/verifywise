export const convertToCamelCaseRiskKey = (riskLevel: string): string => {
  const processedString = riskLevel
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase()) // Capitalize first letter of each word
    .replace(/\s+/g, "") // Remove spaces
    .replace(/^./, (c) => c.toLowerCase()); // Make first character lowercase
  return processedString;
};

export const stringToArray = (str: string): Array<number> => {
  if (str === null || str === "") {
    return [];
  }
  if (str.startsWith("[") && str.endsWith("]")) {
    return JSON.parse(str);
  } else {
    return [parseInt(str)];
  }
};
