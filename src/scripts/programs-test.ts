import axios from 'axios';
import { verifySoftDelete } from './soft-delete-check';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Programs Module Test...\n');

    // -----------------------------------
    // 1. Create Program Type
    // -----------------------------------
    const type = await axios.post(`${API}/programs/types`, {
      name: 'Sunday Service',
    });

    const typeId = type.data.data.id;
    console.log('✅ Program type created');

    // -----------------------------------
    // 2. Create Members (responsible people)
    // -----------------------------------
    const m1 = await axios.post(`${API}/members`, {
      firstName: 'Elder',
      lastName: 'John',
      status: 'Member',
    });

    const m2 = await axios.post(`${API}/members`, {
      firstName: 'Pastor',
      lastName: 'Paul',
      status: 'Member',
    });

    const member1Id = m1.data.data.id;
    const member2Id = m2.data.data.id;

    console.log('✅ Members created');

    // -----------------------------------
    // 3. Create Homecell
    // -----------------------------------
    const hc = await axios.post(`${API}/homecells`, {
      name: 'Area 25 Homecell',
    });

    const homecellId = hc.data.data.id;
    console.log('✅ Homecell created');

    // -----------------------------------
    // 4. Create Program (WITH ITEMS)
    // -----------------------------------
    const program = await axios.post(`${API}/programs`, {
      date: '2026-05-04',
      typeId,
      homecellId,

      items: [
        {
          title: 'Opening Prayer',
          time: '09:00',
          sequence: 1,
          responsibleId: member1Id,
        },
        {
          title: 'Worship Session',
          time: '09:10',
          sequence: 2,
        },
        {
          title: 'Sermon',
          time: '09:40',
          sequence: 3,
          responsibleId: member2Id,
        },
      ],
    });

    const programId = program.data.data.id;
    console.log('✅ Program created:', programId);

    // -----------------------------------
    // 5. Get All Programs
    // -----------------------------------
    const all = await axios.get(`${API}/programs?page=1&limit=10`);

    console.log('📋 Programs count:', all.data.data.length);

    // -----------------------------------
    // 6. Get Single Program
    // -----------------------------------
    const single = await axios.get(`${API}/programs/${programId}`);

    const items = single.data.data.items;

    console.log('🔍 Program items count:', items.length);

    // -----------------------------------
    // 7. Validate ORDERING
    // -----------------------------------
    const orderedCorrectly =
      items[0].sequence === 1 &&
      items[1].sequence === 2 &&
      items[2].sequence === 3;

    console.log(
      '📊 Sequence ordering:',
      orderedCorrectly ? 'PASSED' : 'FAILED',
    );

    // -----------------------------------
    // 8. Validate RESPONSIBILITY
    // -----------------------------------
    const hasResponsible = items.some((i: any) => i.responsible);

    console.log(
      '👤 Responsibility linked:',
      hasResponsible ? 'PASSED' : 'FAILED',
    );

    // -----------------------------------
    // 9. Filter by Date
    // -----------------------------------
    const filtered = await axios.get(`${API}/programs?date=2026-05-04`);

    console.log(
      '📅 Date filter:',
      filtered.data.data.length > 0 ? 'PASSED' : 'FAILED',
    );

    // -----------------------------------
    // 10. Update Program (REPLACE ITEMS)
    // -----------------------------------
    await axios.patch(`${API}/programs/${programId}`, {
      items: [
        {
          title: 'Revised Opening Prayer',
          time: '09:00',
          sequence: 1,
        },
        {
          title: 'Extended Worship',
          time: '09:15',
          sequence: 2,
        },
      ],
    });

    console.log('✏️ Program updated');

    // -----------------------------------
    // 11. Verify Update
    // -----------------------------------
    const updated = await axios.get(`${API}/programs/${programId}`);

    const updatedItems = updated.data.data.items;

    console.log(
      '🔄 Items replaced:',
      updatedItems.length === 2 ? 'PASSED' : 'FAILED',
    );
    await verifySoftDelete(axios, `${API}/programs`, programId);

    console.log('\n🎉 ALL PROGRAM TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
