export const logErrorToFirebase = (error, context) => {
  console.error(`[${context}] Error:`, error);
  // You can add actual firebase logging logic here later if needed
};