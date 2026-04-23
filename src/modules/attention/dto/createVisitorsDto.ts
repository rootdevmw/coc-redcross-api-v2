export class CreateVisitorDto {
  name!: string;
  phone?: string;
  email?: string;

  visitDate!: string;
  groupSize!: string;

  isChurchOfChrist?: string;
  language?: string;

  hasSpecialNeeds?: string; // "Yes" | "No"
  specialNeedsDetails?: string;

  message?: string;
}
