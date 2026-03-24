// In production (Amplify), VITE_API_BASE_URL points to the Lambda API Gateway URL.
// In local dev, it's empty so requests go to the Vite proxy (localhost:8000).
export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
