import mongoose, { Document, Schema, Model } from 'mongoose';

export const CUSTOMER_ROLES = ['parent', 'individual', 'coach'] as const;
export const ALL_ROLES = ['parent', 'individual', 'coach', 'admin'] as const;

export type CustomerRole = (typeof CUSTOMER_ROLES)[number];
export type UserRole = (typeof ALL_ROLES)[number];

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends IUser, Document {}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UserSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long.'],
      maxlength: [100, 'Name cannot exceed 100 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address.'],
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required.'],
      select: false, // Omitted from query results by default
    },
    role: {
      type: String,
      required: [true, 'Role is required.'],
      enum: {
        values: ALL_ROLES,
        message: 'Invalid role "{VALUE}". Allowed roles are: parent, individual, coach, admin.',
      },
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const User: Model<IUserDocument> =
  (mongoose.models.User as Model<IUserDocument>) ||
  mongoose.model<IUserDocument>('User', UserSchema);
