import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const now = () =>
  new Date(Date.now() + 9 * 3600_000).toISOString().replace('Z', '+09:00').slice(0, 19);

const entries = [
  ['메디픽 데모 피부클리닉', '피부과', '의원', '서울', '강남구', '피부 고민별 진료정보와 전문자료를 한곳에서 확인하는 예시 병원입니다.', '피부과,여드름,레이저', 'mint', 0],
  ['메디픽 데모 바른정형외과', '정형외과', '의원', '서울', '송파구', '무릎·허리 등 근골격계 관련 진료 및 의학 콘텐츠 소개 예시입니다.', '정형외과,척추,관절', 'blue', 0],
  ['메디픽 데모 온가족내과', '내과', '의원', '서울', '마포구', '만성질환 관리와 건강검진 관련 콘텐츠를 모아보는 예시입니다.', '내과,건강검진,고혈압', 'peach', 0],
  ['메디픽 데모 미소치과', '치과', '치과의원', '서울', '서초구', '치과 진료과목과 의료정보를 비교할 수 있는 예시입니다.', '치과,예방치료', 'lavender', 0],
  ['메디픽 데모 여성의원', '산부인과', '의원', '경기', '성남시', '여성건강 정보를 찾아볼 수 있는 예시 의원입니다.', '산부인과,검진', 'pink', 0],
  ['메디픽 데모 아이소아과', '소아청소년과', '의원', '서울', '영등포구', '소아청소년과에서 제공하는 교육 콘텐츠를 볼 수 있는 예시입니다.', '소아청소년과,예방접종', 'yellow', 0],
  ['메디픽 데모 공공심야약국', '약국', '약국', '서울', '종로구', '공공심야약국 UI를 시험하기 위한 가상 약국입니다.', '약국,심야,야간', 'indigo', 1],
  ['메디픽 데모 마음의원', '정신건강의학과', '의원', '부산', '해운대구', '정신건강 관련 일반 지식을 살펴보는 예시입니다.', '정신건강의학과,상담', 'green', 0],
  ['메디픽 데모 라인성형외과', '성형외과', '의원', '서울', '강남구', '수술 전 일반적으로 확인할 정보와 의학 콘텐츠를 소개하는 예시입니다.', '성형외과,수술안전', 'rose', 0],
];

const demoCoords = [
  [1, 37.4979, 127.0276],
  [2, 37.5145, 127.1059],
  [3, 37.5566, 126.9235],
  [4, 37.4913, 127.0082],
  [9, 37.4964, 127.0349],
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const c = await client.query('SELECT count(*)::int AS n FROM providers');
if (c.rows[0].n > 0) {
  console.log('already seeded');
  await client.end();
  process.exit(0);
}

for (let ix = 0; ix < entries.length; ix++) {
  const [name, category, kind, region, district, descr, spec, style, night] = entries[ix];
  const r = await client.query(
    `INSERT INTO providers (external_key,name,category,kind,region,district,description,specialties,image_style,night,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [`demo-${ix + 1}`, name, category, kind, region, district, descr, spec, style, night, now()],
  );
  const pid = r.rows[0].id;
  if (category !== '약국') {
    const d = await client.query(
      `INSERT INTO doctors (provider_id,name,specialty,credentials,society,intro,verification,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        pid,
        `샘플 의료진 ${ix + 1}`,
        category,
        '전문의 자격 확인 전 (데모)',
        '학회 소속 확인 전 (데모)',
        '운영자가 자격·소속·면허 정보를 검증한 후 공개되는 의료진 소개 공간입니다.',
        'unverified',
        now(),
      ],
    );
    const docid = d.rows[0].id;
    await client.query(
      `INSERT INTO content (provider_id,doctor_id,title,summary,kind,category,author_label,approved,published_at,editorial_priority)
       VALUES ($1,$2,$3,$4,'guide',$5,$6,1,$7,1), ($1,$2,$8,$9,'shorts',$5,$10,1,$7,0)`,
      [
        pid,
        docid,
        `${category} 진료 전에 확인할 기본 정보`,
        '이 자료는 의사가 작성한 실제 게시물이 아닌 데모 예시입니다.',
        category,
        '메디픽 데모 편집본',
        now(),
        '의사 블로그·쇼츠 콘텐츠 연동 예시',
        '실제 블로그·쇼츠 URL을 운영자 승인을 통해 연결하면 이 위치에서 소개됩니다.',
        '메디픽 데모 콘텐츠',
      ],
    );
  }
  if ([0, 1, 2, 8].includes(ix)) {
    await client.query(
      `INSERT INTO ads (provider_id,category,headline,priority,active,approved,created_at) VALUES ($1,$2,$3,$4,1,1,$5)`,
      [pid, category, `${category} 정보 탐색 스폰서 영역 (데모)`, 100 - ix, now()],
    );
  }
}

for (const [pid, lat, lng] of demoCoords) {
  const check = await client.query(`SELECT id FROM providers WHERE id = $1 AND external_key LIKE 'demo-%'`, [pid]);
  if (!check.rows.length) continue;
  await client.query(
    `INSERT INTO subscriptions (provider_id,status,paid,compliance_approved,expires_at,started_at,plan,updated_at)
     VALUES ($1,'active',1,1,'2099-12-31T23:59:59+09:00',$2::timestamptz,'demo',$3::timestamptz) ON CONFLICT DO NOTHING`,
    [pid, now(), now()],
  );
  await client.query(
    `INSERT INTO locations (provider_id,latitude,longitude,coordinate_source,updated_at)
     VALUES ($1,$2,$3,'가상 시연좌표(실제 병원 위치 아님)',$4::timestamptz) ON CONFLICT DO NOTHING`,
    [pid, lat, lng, now()],
  );
}

console.log('seed complete');
await client.end();
