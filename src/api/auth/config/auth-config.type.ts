export type AuthConfig = {
  secret: string;
  expires: string;
  refreshSecret: string;
  refreshExpires: string;
  forgotSecret: string;
  forgotExpires: string;
  forgotMaxAttempt: number;
  forgotMaxAttemptExpiresIn: string;
  forgotBlockTime: string;
  confirmEmailSecret: string;
  confirmEmailExpires: string;
};
