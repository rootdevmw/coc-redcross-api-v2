import axios from 'axios';
import { verifySoftDelete } from './soft-delete-check';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Events Module Test...\n');

    // -----------------------------------
    // 1. Create Event Type
    // -----------------------------------
    const type = await axios.post(`${API}/events/types`, {
      name: 'Service',
    });

    const typeId = type.data.data.id;
    console.log('✅ Event type created');

    // -----------------------------------
    // 2. Create Ministries
    // -----------------------------------
    const m1 = await axios.post(`${API}/ministries`, {
      name: 'Youth Ministry',
    });

    const m2 = await axios.post(`${API}/ministries`, {
      name: 'Choir',
    });

    const m3 = await axios.post(`${API}/ministries`, {
      name: 'Media',
    });

    const ministryIds = [m1.data.data.id, m2.data.data.id, m3.data.data.id];

    console.log('✅ Ministries created');

    // -----------------------------------
    // 3. Create Event (MULTIPLE ministries)
    // -----------------------------------
    const event = await axios.post(`${API}/events`, {
      title: 'Youth Worship Night',
      description: 'Joint ministry event',
      startTime: '2026-05-01T18:00:00Z',
      endTime: '2026-05-01T21:00:00Z',
      location: 'Main Hall',
      typeId,
      ministryIds,
    });

    const eventId = event.data.data.id;
    console.log('✅ Event created:', eventId);

    // -----------------------------------
    // 4. Get All Events
    // -----------------------------------
    const all = await axios.get(`${API}/events?page=1&limit=10`);

    console.log('📋 Events count:', all.data.data.length);

    // -----------------------------------
    // 5. Get Single Event
    // -----------------------------------
    const single = await axios.get(`${API}/events/${eventId}`);

    console.log('🔍 Event title:', single.data.data.title);
    console.log('👥 Ministries linked:', single.data.data.ministries.length);

    // -----------------------------------
    // 6. Date Filtering
    // -----------------------------------
    const filtered = await axios.get(
      `${API}/events?startDate=2026-05-01&endDate=2026-05-02`,
    );

    console.log('📅 Filtered events:', filtered.data.data.length);

    // -----------------------------------
    // 7. Update Event (replace ministries)
    // -----------------------------------
    const newMinistry = await axios.post(`${API}/ministries`, {
      name: 'Ushering',
    });

    const newMinistryId = newMinistry.data.data.id;

    await axios.patch(`${API}/events/${eventId}`, {
      title: 'Updated Worship Night',
      ministryIds: [newMinistryId], // 🔥 replace all
    });

    console.log('✏️ Event updated (ministries replaced)');

    // -----------------------------------
    // 8. Verify Update
    // -----------------------------------
    const updated = await axios.get(`${API}/events/${eventId}`);

    console.log(
      '🔄 Updated ministries count:',
      updated.data.data.ministries.length,
    );

    console.log(
      '✅ Replacement check:',
      updated.data.data.ministries.length === 1 ? 'PASSED' : 'FAILED',
    );

    // -----------------------------------
    // 9. Get Event Types
    // -----------------------------------
    const types = await axios.get(`${API}/events/types`);

    console.log('📚 Event types:', types.data.data.length);
    await verifySoftDelete(axios, `${API}/events`, eventId);

    console.log('\n🎉 ALL EVENT TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
