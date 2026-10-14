/** Clinic Content API response shapes (clinic-content.yaml). */

export interface ClinicHoursDto {
  timezone: string;
  openNow: boolean;
  standard: Array<{
    weekday: number;
    opensAt: string | null;
    closesAt: string | null;
    closed: boolean;
  }>;
  holidays: Array<{
    date: string;
    opensAt: string | null;
    closesAt: string | null;
    closed: boolean;
  }>;
}

export interface ClinicContactDto {
  name: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
  };
  mainPhone: string;
  emergencyPhone: string;
  whatsappDisplay: string | null;
}

export interface ServiceSummaryDto {
  id: string;
  name: string;
  slug: string;
  summary: string;
  baselinePrice: string | null;
  currency: string | null;
  category: string;
  featured: boolean;
}

export interface ServiceDetailDto extends ServiceSummaryDto {
  descriptionMd: string | null;
  requiresAppointment: boolean;
}

export interface StaffProfileDto {
  id: string;
  displayName: string;
  title: string;
  credentials: string[];
  accreditations: string[];
  bioMd: string | null;
  photoUrl: string | null;
  specialisms: string[];
}

export interface DocumentSummaryDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  mimeType: string;
  byteSize: number;
}

export interface DocumentDownloadDto {
  downloadUrl: string;
  expiresAt: string;
}
