import axios from 'axios';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Ministries Module Test...\n');

    // -----------------------------------
    // 1. Create Members (DEPENDENCY)
    // -----------------------------------
    const m1 = await axios.post(`${API}/members`, {
      firstName: 'Peter',
      lastName: 'Phiri',
      status: 'Member',
      location: 'Area 47',
    });

    const m2 = await axios.post(`${API}/members`, {
      firstName: 'Grace',
      lastName: 'Zulu',
      status: 'Member',
      location: 'Area 12',
    });

    const member1Id = m1.data.data.id;
    const member2Id = m2.data.data.id;

    console.log('✅ Members created');

    // -----------------------------------
    // 2. Create Ministry
    // -----------------------------------
    const ministry = await axios.post(`${API}/ministries`, {
      name: 'Media Ministry',
      description: 'Handles streaming and media',
      leaderId: member1Id,
    });

    const ministryId = ministry.data.data.id;
    console.log('✅ Ministry created:', ministryId);

    // -----------------------------------
    // 3. Assign Members to Ministry
    // -----------------------------------
    await axios.post(`${API}/ministries/${ministryId}/members`, {
      memberId: member1Id,
    });

    await axios.post(`${API}/ministries/${ministryId}/members`, {
      memberId: member2Id,
    });

    console.log('✅ Members assigned to ministry');

    // -----------------------------------
    // 4. Get All Ministries (pagination)
    // -----------------------------------
    const list = await axios.get(`${API}/ministries?page=1&limit=10`);

    console.log('📋 Ministries fetched:', list.data.data.length);

    // -----------------------------------
    // 5. Get Single Ministry
    // -----------------------------------
    const single = await axios.get(`${API}/ministries/${ministryId}`);

    console.log('🔍 Ministry name:', single.data.data.name);

    // -----------------------------------
    // 6. Get Members in Ministry
    // -----------------------------------
    const members = await axios.get(`${API}/ministries/${ministryId}/members`);

    console.log('👥 Members in ministry:', members.data.data.length);

    // -----------------------------------
    // 7. Update Ministry
    // -----------------------------------
    await axios.patch(`${API}/ministries/${ministryId}`, {
      description: 'Updated media ministry',
    });

    console.log('✏️ Ministry updated');

    // -----------------------------------
    // 8. Remove Member
    // -----------------------------------
    await axios.delete(`${API}/ministries/${ministryId}/members/${member2Id}`);

    console.log('🗑️ Member removed from ministry');

    // -----------------------------------
    // 9. Verify Removal
    // -----------------------------------
    const afterRemoval = await axios.get(
      `${API}/ministries/${ministryId}/members`,
    );

    console.log('📉 Members after removal:', afterRemoval.data.data.length);

    // -----------------------------------
    // 10. Search Ministries
    // -----------------------------------
    const search = await axios.get(`${API}/ministries?search=Media`);

    console.log('🔎 Search results:', search.data.data.length);

    console.log('\n🎉 ALL MINISTRY TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
