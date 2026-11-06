import { Types } from "mongoose";

/**
 * Validates whether a string is a valid MongoDB ObjectId.
 */
export const isValidObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id;
};
