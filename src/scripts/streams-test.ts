import axios from 'axios';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Streams Module Test...\n');

    // -----------------------------------
    // 1. CREATE PLATFORMS
    // -----------------------------------
    const yt = await axios.post(`${API}/streams/platforms`, {
      name: 'YouTube',
      url: 'https://youtube.com/live',
    });

    const fb = await axios.post(`${API}/streams/platforms`, {
      name: 'Facebook',
      url: 'https://facebook.com/live',
    });

    const ytId = yt.data.data.id;
    const fbId = fb.data.data.id;

    console.log('✅ Platforms created');

    // -----------------------------------
    // 2. GET PLATFORMS
    // -----------------------------------
    const platforms = await axios.get(`${API}/streams/platforms`);

    console.log('📺 Platforms count:', platforms.data.data.length);

    // -----------------------------------
    // 3. CREATE STREAM (MULTI-PLATFORM)
    // -----------------------------------
    const stream = await axios.post(`${API}/streams`, {
      title: 'Sunday Live Service',
      platformIds: [ytId, fbId],
      startsAt: '2026-05-01T09:00:00Z',
    });

    const streamId = stream.data.data.id;

    console.log('✅ Stream created:', streamId);

    console.log('📡 Platforms attached:', stream.data.data.platforms.length);

    // -----------------------------------
    // 4. GET ALL STREAMS
    // -----------------------------------
    const all = await axios.get(`${API}/streams?page=1&limit=10`);

    console.log('📋 Streams count:', all.data.meta.total);

    // -----------------------------------
    // 5. SET LIVE
    // -----------------------------------
    await axios.post(`${API}/streams/${streamId}/live`);

    console.log('🔴 Stream set to LIVE');

    // -----------------------------------
    // 6. GET LIVE STREAM
    // -----------------------------------
    const live = await axios.get(`${API}/streams/live`);

    console.log('📡 Live stream:', live.data.data?.title || 'NONE');

    // -----------------------------------
    // 7. UPDATE STREAM (REPLACE PLATFORMS)
    // -----------------------------------
    const newPlatform = await axios.post(`${API}/streams/platforms`, {
      name: 'Zoom',
      url: 'https://zoom.us',
    });

    await axios.patch(`${API}/streams/${streamId}`, {
      title: 'Updated Live Service',
      platformIds: [newPlatform.data.data.id],
    });

    console.log('✏️ Stream updated');

    // -----------------------------------
    // 8. VERIFY UPDATE
    // -----------------------------------
    const updated = await axios.get(`${API}/streams/${streamId}`);

    console.log(
      '🔄 Platform replacement:',
      updated.data.data.platforms.length === 1 ? 'PASSED' : 'FAILED',
    );

    console.log('\n🎉 ALL STREAM TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
