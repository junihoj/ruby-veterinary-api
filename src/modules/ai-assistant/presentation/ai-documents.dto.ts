import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const DOCUMENT_CATEGORIES = [
  'policy',
  'services',
  'hours',
  'pricing',
  'catalog',
  'faq',
  'other',
] as const;

export const DOCUMENT_STATUSES = [
  'pending_review',
  'active',
  'archived',
] as const;

export class UpdateDocumentBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(DOCUMENT_CATEGORIES)
  category?: (typeof DOCUMENT_CATEGORIES)[number];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_date must be YYYY-MM-DD.',
  })
  effective_date?: string;
}
