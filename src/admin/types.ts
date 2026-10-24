export interface City { id: number; name: string; namePrepositional: string; slug: string; sortOrder: number; lots: number }
export interface Category { id: number; name: string; slug: string; sortOrder: number; lots: number }

export interface Meta {
  admin: { id: number; name: string };
  cities: City[];
  categories: Category[];
  leadsSummary: { unread: number; new: number; undelivered: number };
  site: { name: string; url: string; miniAppLink: string | null };
}

export interface Business {
  id: number;
  lotNumber: number;
  slug: string;
  publicTitle: string;
  categoryId: number | null;
  cityId: number | null;
  areaNote: string | null;
  priceIls: number | null;
  priceNegotiable: boolean;
  monthlyRevenueIls: number | null;
  monthlyProfitIls: number | null;
  paybackMonths: number | null;
  yearFounded: number | null;
  employeesCount: number | null;
  areaSqm: number | null;
  rentMonthlyIls: number | null;
  leaseUntil: string | null;
  legalForm: string | null;
  businessLicense: string | null;
  includedInSale: string[];
  ownerSupport: string | null;
  reasonForSale: string | null;
  shortDescription: string;
  description: string;
  videoUrl: string | null;
  isFeatured: boolean;
  status: 'draft' | 'published' | 'hidden';
  publishedAt: number | null;
  notifiedAt: number | null;
  realName: string | null;
  exactAddress: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerTelegram: string | null;
  internalNotes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Photo { id: number; url: string; urlSmall: string; width: number; height: number; alt: string | null; sortOrder: number }
export interface AuditEntry { id: number; adminName: string | null; adminId: number; action: string; createdAt: number }

export interface BusinessDetail {
  business: Business;
  photos: Photo[];
  audit: AuditEntry[];
  path: string;
  previewUrl: string;
  missing: string[];
  notificationQueued?: boolean;
}

export interface ListingRow {
  id: number; lotNumber: number; publicTitle: string; status: Business['status']; cityName: string | null;
  isFeatured: boolean; priceIls: number | null; publishedAt: number | null; updatedAt: number;
  path: string; cover: string | null; views30: number; leads30: number;
}

export interface LeadRow {
  id: number; createdAt: number; businessId: number; name: string | null; phone: string | null;
  preferredContact: 'phone' | 'whatsapp' | 'telegram'; status: 'new' | 'in_progress' | 'closed_won' | 'closed_lost';
  isRead: boolean; tgDelivered: boolean | null; source: 'mini_app' | 'web'; handledByName: string | null;
  telegramUsername: string | null; lotNumber: number; publicTitle: string;
}
