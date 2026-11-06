export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Regular expression requiring at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character
export const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/;

export const PASSWORD_POLICY_MESSAGE =
  "Password must be between 8 and 128 characters and include at least one uppercase letter, one lowercase letter, one number, and one special character";
