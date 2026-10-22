import { BadRequestException } from '@nestjs/common';
import { isEmail } from 'class-validator';
export function publicPrayerInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Enter a prayer request.');
  const value = input as Record<string, unknown>;
  if (value.shareWithElders === 'No')
    throw new BadRequestException(
      'Private prayers are not submitted to the church.',
    );
  if (value.shareWithElders !== undefined && value.shareWithElders !== 'Yes')
    throw new BadRequestException('Choose whether to share your prayer.');
  function text(key: string, required = false, max = 191) {
    const field = value[key];
    if (field === undefined && !required) return null;
    if (
      typeof field !== 'string' ||
      field.trim().length > max ||
      (required && !field.trim())
    )
      throw new BadRequestException('Review the prayer request fields.');
    return field.trim() || null;
  }
  const request = text('request', true, 16000)!;
  if (Buffer.byteLength(request, 'utf8') > 64000)
    throw new BadRequestException('Shorten your prayer request.');
  const email = text('email');
  if (email && !isEmail(email))
    throw new BadRequestException('Enter a valid email address.');
  if (value.isUrgent !== undefined && typeof value.isUrgent !== 'boolean')
    throw new BadRequestException('Choose a valid urgency option.');
  return {
    name: text('name'),
    phone: text('phone'),
    email,
    requestType: text('requestType'),
    prayerFor: text('prayerFor', true)!,
    request,
    isUrgent: value.isUrgent === true,
    shareWithElders: true,
  };
}
