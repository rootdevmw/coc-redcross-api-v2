import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'AUDIT_KEY';

export interface AuditMeta {
  action: string;
  entity: string;
  idParamIndex?: number; // where ID is in method args
  fetchBefore?: boolean;
}

export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);
