const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
require('ts-node').register({
  project: path.resolve(__dirname, '../tsconfig.json'),
  transpileOnly: true,
  compilerOptions: { emitDecoratorMetadata: false },
});
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: {},
});
const { Logger } = require('@nestjs/common');
Logger.overrideLogger(false);
const {
  ProgramsService,
} = require('../src/modules/programs/programs.service.ts');
const { ContentService } = require('../src/modules/content/content.service.ts');
const {
  catalogTypeName,
  catalogTypeId,
} = require('../src/common/utils/type-catalog.ts');

test('type writes reject blank, malformed and oversize inputs before accessing the database', async () => {
  for (const value of [null, [], '', '  ', 'a'.repeat(101)])
    assert.throws(
      () => catalogTypeName(value),
      (error) => error.getStatus() === 400,
    );
  for (const value of ['0', '-1', '2/3', 'abc'])
    assert.throws(
      () => catalogTypeId(value),
      (error) => error.getStatus() === 400,
    );
  assert.equal(catalogTypeName(' Sunday service '), 'Sunday service');
  let writes = 0;
  const prisma = {
    programType: {
      create: async () => {
        writes++;
      },
    },
    contentType: {
      create: async () => {
        writes++;
      },
    },
  };
  await assert.rejects(
    () => new ProgramsService(prisma, {}, {}).createType('  '),
    (error) => error.getStatus() === 400,
  );
  await assert.rejects(
    () => new ContentService(prisma, {}, {}, {}).createType('  '),
    (error) => error.getStatus() === 400,
  );
  assert.equal(writes, 0);
});

test('program creation and rename record the actor and translate duplicate names to useful conflicts', async () => {
  const records = [{ id: 7n, name: 'Sunday', deletedAt: null }];
  const audits = [];
  const prisma = {
    programType: {
      create: async ({ data }) => {
        assert.equal(data.name, 'Evening');
        return { id: 8n, ...data };
      },
      findFirst: async () => records[0],
      update: async ({ data }) => ({ ...records[0], ...data }),
    },
  };
  const service = new ProgramsService(
    prisma,
    { log: async (entry) => audits.push(entry) },
    {},
  );
  await service.createType(' Evening ', { id: 9n });
  const renamed = await service.updateType('7', ' Morning ', { id: 9n });
  assert.equal(renamed.data.name, 'Morning');
  assert.deepEqual(
    audits.map(({ action, entity, entityId, userId }) => ({
      action,
      entity,
      entityId,
      userId,
    })),
    [
      {
        action: 'PROGRAM_TYPE_CREATED',
        entity: 'ProgramType',
        entityId: '8',
        userId: 9n,
      },
      {
        action: 'PROGRAM_TYPE_UPDATED',
        entity: 'ProgramType',
        entityId: '7',
        userId: 9n,
      },
    ],
  );
  prisma.programType.create = async () => {
    throw { code: 'P2002' };
  };
  prisma.programType.update = async () => {
    throw { code: 'P2002' };
  };
  await assert.rejects(
    () => service.createType('Evening'),
    (error) => error.getStatus() === 409,
  );
  await assert.rejects(
    () => service.updateType('7', 'Morning'),
    (error) => error.getStatus() === 409,
  );
  assert.equal(audits.length, 2);
  prisma.programType.findFirst = async () => null;
  await assert.rejects(
    () => service.updateType('7', 'Morning'),
    (error) => error.getStatus() === 404,
  );
});

test('content type creation trims names, records history and translates duplicate-name conflicts', async () => {
  const audits = [];
  const prisma = {
    contentType: { create: async ({ data }) => ({ id: 2n, ...data }) },
  };
  const service = new ContentService(
    prisma,
    {},
    { log: async (entry) => audits.push(entry) },
    {},
  );
  const response = await service.createType(' Teaching ', { id: 9n });
  assert.equal(response.data.name, 'Teaching');
  assert.equal(audits[0].action, 'CONTENT_TYPE_CREATED');
  assert.equal(audits[0].userId, 9n);
  prisma.contentType.create = async () => {
    throw { code: 'P2002' };
  };
  await assert.rejects(
    () => service.createType('Teaching'),
    (error) => error.getStatus() === 409,
  );
});

test('program type deletion blocks active programs and templates, checks missing IDs and only removes an unused catalog entry', async () => {
  for (const [programs, templates, present] of [
    [1, 0, true],
    [0, 1, true],
    [0, 0, false],
    [0, 0, true],
  ]) {
    const calls = [];
    const audits = [];
    const prisma = {
      programType: {
        findFirst: async (options) => {
          calls.push(['find', options]);
          return present ? { id: 7n, name: 'Sunday', deletedAt: null } : null;
        },
        update: async (options) => {
          calls.push(['remove', options]);
          return {};
        },
      },
      program: {
        count: async (options) => {
          calls.push(['programs', options]);
          return programs;
        },
      },
      programTemplate: {
        count: async (options) => {
          calls.push(['templates', options]);
          return templates;
        },
      },
      $transaction: async (work, options) => {
        assert.equal(options.isolationLevel, 'Serializable');
        return work(prisma);
      },
    };
    const service = new ProgramsService(
      prisma,
      { log: async (entry) => audits.push(entry) },
      {},
    );
    if (programs || templates || !present) {
      await assert.rejects(
        () => service.removeType('7', { id: 9n }),
        (error) => error.getStatus() === (present ? 409 : 404),
      );
      assert.equal(
        calls.some(([method]) => method === 'remove'),
        false,
      );
      assert.equal(audits.length, 0);
    } else {
      assert.equal((await service.removeType('7', { id: 9n })).success, true);
      assert.deepEqual(calls[1], [
        'programs',
        { where: { typeId: 7n, deletedAt: null } },
      ]);
      assert.deepEqual(calls[2], [
        'templates',
        { where: { typeId: 7n, deletedAt: null } },
      ]);
      assert.ok(calls[3][1].data.deletedAt instanceof Date);
      assert.equal(audits[0].action, 'PROGRAM_TYPE_DELETED');
      assert.equal(audits[0].userId, 9n);
      assert.equal(prisma.program.delete, undefined);
      assert.equal(prisma.programTemplate.delete, undefined);
    }
  }
});

test('catalog reads retain full-collection contracts with active predicates and stable names', async () => {
  const calls = [];
  const prisma = {
    programType: {
      findMany: async (options) => {
        calls.push(options);
        return [];
      },
    },
    contentType: {
      findMany: async (options) => {
        calls.push(options);
        return [];
      },
    },
  };
  assert.deepEqual(await new ProgramsService(prisma, {}, {}).getTypes(), {
    success: true,
    data: [],
    meta: {},
  });
  assert.deepEqual(await new ContentService(prisma, {}, {}, {}).getTypes(), {
    success: true,
    data: [],
    meta: {},
  });
  for (const call of calls)
    assert.deepEqual(call, {
      where: { deletedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
});

test('type routes enforce the existing MEDIA and DEACON hierarchy and pass the real actor to program-type writes', () => {
  const { Reflector } = require('@nestjs/core');
  const { RolesGuard } = require('../src/modules/auth/guard/roles.guard.ts');
  const {
    ContentController,
  } = require('../src/modules/content/content.controller.ts');
  const {
    ProgramsController,
  } = require('../src/modules/programs/programs.controller.ts');
  const {
    PATH_METADATA,
    METHOD_METADATA,
  } = require('@nestjs/common/constants');
  const { RequestMethod } = require('@nestjs/common');
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, ProgramsController.prototype.removeType),
    'types/:id',
  );
  assert.equal(
    Reflect.getMetadata(
      METHOD_METADATA,
      ProgramsController.prototype.removeType,
    ),
    RequestMethod.DELETE,
  );
  const guard = new RolesGuard(new Reflector());
  for (const [Controller, method, allowed, blocked] of [
    [ContentController, 'createType', 'MEDIA', 'MEMBER'],
    [ProgramsController, 'createType', 'DEACON', 'MEDIA'],
    [ProgramsController, 'updateType', 'DEACON', 'MEDIA'],
    [ProgramsController, 'removeType', 'DEACON', 'MEDIA'],
  ]) {
    const context = (role) => ({
      getHandler: () => Controller.prototype[method],
      getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [role] } }) }),
    });
    assert.equal(guard.canActivate(context(allowed)), true);
    assert.throws(
      () => guard.canActivate(context(blocked)),
      (error) => error.getStatus() === 403,
    );
  }
  const calls = [];
  const controller = new ProgramsController({
    createType: (...args) => calls.push(args),
    updateType: (...args) => calls.push(args),
    removeType: (...args) => calls.push(args),
  });
  const user = { id: 9n };
  controller.createType('Sunday', { user });
  controller.updateType('7', 'Morning', { user });
  controller.removeType('7', { user });
  assert.deepEqual(calls, [
    ['Sunday', user],
    ['7', 'Morning', user],
    ['7', user],
  ]);
});
