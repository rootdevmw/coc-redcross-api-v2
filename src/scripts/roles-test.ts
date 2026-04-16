import axios from 'axios';
import { verifySoftDelete } from './soft-delete-check';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Roles Module Test...\n');

    const jar = new CookieJar();

    const client = wrapper(
      axios.create({
        baseURL: API,
        withCredentials: true,
        jar,
      }),
    );

    // -----------------------------------
    // 1. REGISTER USER
    // -----------------------------------
    const email = `roles${Date.now()}@test.com`;

    const register = await client.post('/auth/register', {
      email,
      password: 'password123',
    });

    const userId = register.data.data.id;

    console.log('✅ User registered:', email);

    // -----------------------------------
    // 2. LOGIN
    // -----------------------------------
    await client.post('/auth/login', {
      email,
      password: 'password123',
    });

    console.log('🔐 Logged in');

    // -----------------------------------
    // ⚠️ IMPORTANT: BOOTSTRAP ADMIN
    // -----------------------------------
    console.log('\n⚠️ Assign ADMIN role manually before continuing');
    console.log('Options:');
    console.log('1. Use Prisma Studio');
    console.log('2. Insert into UserRole table');
    console.log(`User ID: ${userId}\n`);

    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Re-login to refresh session roles
    await client.post('/auth/login', {
      email,
      password: 'password123',
    });

    console.log('🔐 Re-login after admin assignment');

    // -----------------------------------
    // 3. CREATE ROLE
    // -----------------------------------
    const create = await client.post('/roles', {
      name: 'TEST_ROLE',
    });

    const roleId = create.data.data.id;

    console.log('✅ Role created:', roleId);

    // -----------------------------------
    // 4. GET ALL ROLES
    // -----------------------------------
    const all = await client.get('/roles');

    console.log(`📋 Roles count: ${all.data.data.length}`);

    // -----------------------------------
    // 5. GET ONE ROLE
    // -----------------------------------
    const one = await client.get(`/roles/${roleId}`);

    console.log('🔍 Retrieved role:', one.data.data.name);

    // -----------------------------------
    // 6. UPDATE ROLE
    // -----------------------------------
    const updated = await client.patch(`/roles/${roleId}`, {
      name: 'UPDATED_ROLE',
    });

    console.log('✏️ Updated role:', updated.data.data.name);

    // -----------------------------------
    // 7. DELETE ROLE + VERIFY SOFT DELETE
    // -----------------------------------
    await verifySoftDelete(client, '/roles', roleId);

    // -----------------------------------
    // 9. RBAC TEST (WITHOUT ADMIN)
    // -----------------------------------
    const jar2 = new CookieJar();
    const client2 = wrapper(
      axios.create({
        baseURL: API,
        withCredentials: true,
        jar: jar2,
      }),
    );

    const email2 = `noadmin${Date.now()}@test.com`;

    await client2.post('/auth/register', {
      email: email2,
      password: 'password123',
    });

    await client2.post('/auth/login', {
      email: email2,
      password: 'password123',
    });

    try {
      await client2.post('/roles', { name: 'SHOULD_FAIL' });
      console.log('❌ RBAC FAILED: Non-admin created role');
    } catch {
      console.log('✅ RBAC WORKING: Non-admin blocked');
    }

    console.log('\n🎉 ROLES TEST COMPLETED SUCCESSFULLY');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
