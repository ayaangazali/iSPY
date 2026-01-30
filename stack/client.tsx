// Stack Auth disabled for React 19 compatibility
export const stackClientApp = {
  signInWithOAuth: async (provider: string) => {
    window.location.href = "/pages/dashboard";
  },
};
