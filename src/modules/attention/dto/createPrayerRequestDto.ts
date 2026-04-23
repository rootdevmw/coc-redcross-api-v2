export class CreatePrayerRequestDto {
  name?: string;
  phone?: string;
  email?: string;

  requestType?: string;
  prayerFor!: string;
  request!: string;

  isUrgent?: boolean;
  shareWithElders?: string; // "Yes" | "No"
}
