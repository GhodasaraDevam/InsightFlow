import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/modules/users/user.model.js";
import { Session } from "../src/modules/sessions/session.model.js";

export const connectTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  }
};

export const disconnectTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

export const cleanupTestData = async (emailPattern: RegExp | string): Promise<void> => {
  const users = await User.find({ email: emailPattern });
  const userIds = users.map((u) => u._id);
  if (userIds.length > 0) {
    await Session.deleteMany({ userId: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds } });
  }
};
