export const DEMO_MODE_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEMO_MODE === "true";
