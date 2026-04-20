import { Prisma, PrismaClient } from '../../generated/prisma/client';

const SOFT_DELETE_MODELS = new Set([
  'User',
  'Role',
  'Member',
  'Homecell',
  'Ministry',
  'ContentType',
  'Content',
  'Media',
  'Tag',
  'Series',
  'ScriptureRef',
  'Announcement',
  'EventType',
  'Event',
  'ProgramType',
  'Program',
  'ProgramItem',
  'Stream',
  'Platform',
  'Newsletter',
]);

function supportsSoftDelete(model?: string) {
  return !!model && SOFT_DELETE_MODELS.has(model);
}

function withNotDeleted(args: any) {
  return {
    ...args,
    where: {
      ...args?.where,
      deletedAt: null,
    },
  };
}

function delegateName(model: string) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export const softDeleteExtension = (client: PrismaClient) =>
  Prisma.defineExtension({
    name: 'soft-delete',

    query: {
      $allModels: {
        async delete({ model, args, query }) {
          if (!supportsSoftDelete(model)) return query(args);

          const delegate = (client as any)[delegateName(model)];

          return delegate.update({
            ...args,
            data: {
              deletedAt: new Date(),
            },
          });
        },

        async deleteMany({ model, args, query }) {
          if (!supportsSoftDelete(model)) return query(args);

          const delegate = (client as any)[delegateName(model)];

          return delegate.updateMany({
            ...args,
            data: {
              deletedAt: new Date(),
            },
          });
        },

        async findMany({ model, args, query }) {
          if (!supportsSoftDelete(model)) return query(args);
          return query(withNotDeleted(args));
        },

        async findFirst({ model, args, query }) {
          if (!supportsSoftDelete(model)) return query(args);
          return query(withNotDeleted(args));
        },

        async findUnique({ model, args, query }) {
          if (!supportsSoftDelete(model)) return query(args);
          return query(withNotDeleted(args));
        },

        async count({ model, args, query }) {
          if (!supportsSoftDelete(model)) return query(args);
          return query(withNotDeleted(args));
        },

        async update({ model, args, query }) {
          if (!supportsSoftDelete(model)) return query(args);
          return query(withNotDeleted(args));
        },

        async updateMany({ model, args, query }) {
          if (!supportsSoftDelete(model)) return query(args);
          return query(withNotDeleted(args));
        },
      },
    },
  });
