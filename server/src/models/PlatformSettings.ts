import mongoose, { Document, Schema, Model } from 'mongoose';
import { COACH_DISCIPLINES, CoachDiscipline } from './CoachProfile';

export interface IPlatformSettings {
  platformName: string;
  supportEmail: string;
  supportPhone?: string;
  supportedDisciplines: CoachDiscipline[];
  cancellationWindowHours: number;
  maxAdvanceBookingDays: number;
  defaultSessionDurationMinutes: number;
  maintenanceMode: boolean;
  maintenanceNotice?: string;
  updatedBy?: mongoose.Types.ObjectId | null;
  updatedByEmail?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlatformSettingsDocument extends IPlatformSettings, Document {}

export const DEFAULT_PLATFORM_SETTINGS: Omit<IPlatformSettings, 'updatedBy' | 'updatedByEmail' | 'createdAt' | 'updatedAt'> = {
  platformName: 'AthleteConnect',
  supportEmail: 'support@athleteconnect.com',
  supportPhone: '+1-800-555-0199',
  supportedDisciplines: [...COACH_DISCIPLINES],
  cancellationWindowHours: 24,
  maxAdvanceBookingDays: 30,
  defaultSessionDurationMinutes: 60,
  maintenanceMode: false,
  maintenanceNotice: '',
};

const PlatformSettingsSchema = new Schema<IPlatformSettingsDocument>(
  {
    platformName: {
      type: String,
      required: true,
      default: DEFAULT_PLATFORM_SETTINGS.platformName,
      trim: true,
      minlength: [2, 'Platform name must be at least 2 characters.'],
      maxlength: [100, 'Platform name cannot exceed 100 characters.'],
    },
    supportEmail: {
      type: String,
      required: true,
      default: DEFAULT_PLATFORM_SETTINGS.supportEmail,
      trim: true,
      lowercase: true,
    },
    supportPhone: {
      type: String,
      default: DEFAULT_PLATFORM_SETTINGS.supportPhone,
      trim: true,
      maxlength: [50, 'Support phone cannot exceed 50 characters.'],
    },
    supportedDisciplines: {
      type: [String],
      default: DEFAULT_PLATFORM_SETTINGS.supportedDisciplines,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0 && v.every((d) => COACH_DISCIPLINES.includes(d as CoachDiscipline)),
        message: 'At least one valid supported sports discipline must be configured.',
      },
    },
    cancellationWindowHours: {
      type: Number,
      required: true,
      default: DEFAULT_PLATFORM_SETTINGS.cancellationWindowHours,
      min: [1, 'Cancellation window must be at least 1 hour.'],
      max: [168, 'Cancellation window cannot exceed 168 hours (7 days).'],
    },
    maxAdvanceBookingDays: {
      type: Number,
      required: true,
      default: DEFAULT_PLATFORM_SETTINGS.maxAdvanceBookingDays,
      min: [1, 'Advance booking limit must be at least 1 day.'],
      max: [90, 'Advance booking limit cannot exceed 90 days.'],
    },
    defaultSessionDurationMinutes: {
      type: Number,
      required: true,
      default: DEFAULT_PLATFORM_SETTINGS.defaultSessionDurationMinutes,
      min: [15, 'Session duration must be at least 15 minutes.'],
      max: [240, 'Session duration cannot exceed 240 minutes (4 hours).'],
    },
    maintenanceMode: {
      type: Boolean,
      default: DEFAULT_PLATFORM_SETTINGS.maintenanceMode,
    },
    maintenanceNotice: {
      type: String,
      default: DEFAULT_PLATFORM_SETTINGS.maintenanceNotice,
      trim: true,
      maxlength: [500, 'Maintenance notice cannot exceed 500 characters.'],
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedByEmail: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const PlatformSettings: Model<IPlatformSettingsDocument> =
  (mongoose.models.PlatformSettings as Model<IPlatformSettingsDocument>) ||
  mongoose.model<IPlatformSettingsDocument>('PlatformSettings', PlatformSettingsSchema);

