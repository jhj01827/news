import { Article } from './types';

export const MOCK_ARTICLES: Article[] = [
  {
    id: 'mock-1',
    category: 'tech',
    hook_title: 'AI가 디자이너를 대체할 수 있을까?',
    summary:
      'Adobe가 Firefly AI를 Photoshop에 전면 통합하며, 생성형 AI 기반 이미지 편집이 전문가 작업 흐름의 핵심으로 자리잡기 시작했다. 단순 배경 제거를 넘어 레이아웃 생성, 오브젝트 추가·삭제까지 가능해지면서 디자인 업계에 격변이 예고된다. 일부 전문가들은 "AI는 도구일 뿐"이라고 선을 긋지만, 프리랜서 디자이너 수요는 이미 감소 추세다.',
    image_url: 'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=600&q=80',
    source_url: 'https://techcrunch.com',
    source_name: 'TechCrunch',
    published_at: new Date().toISOString(),
    keywords: ['생성형AI', '포토샵', '디자인'],
  },
  {
    id: 'mock-2',
    category: 'beauty',
    hook_title: '틱톡이 픽한 2025 스킨케어 성분',
    summary:
      '나이아신아마이드와 세라마이드의 조합이 틱톡에서 폭발적인 반응을 얻고 있다. #skintok 해시태그 조회수가 500억을 돌파했으며, Z세대는 더 이상 브랜드가 아닌 성분으로 제품을 선택한다. 국내 편집숍들도 성분 중심의 큐레이션으로 빠르게 피벗하는 중이다.',
    image_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80',
    source_url: 'https://beautymatter.com',
    source_name: 'BeautyMatter',
    published_at: new Date().toISOString(),
    keywords: ['스킨케어', 'Z세대성분', '틱톡바이럴'],
  },
  {
    id: 'mock-3',
    category: 'fashion',
    hook_title: '조용히 터진 올해의 컬러',
    summary:
      'Pantone이 선정한 2025 올해의 컬러 "Mocha Mousse"가 패션 업계에 조용히 퍼지고 있다. 럭셔리 브랜드부터 SPA까지 이 따뜻한 브라운 계열을 앞다툈 적용 중이며, 인테리어·뷰티 업계로도 트렌드가 확산되는 중이다. 단순한 색상 이상의 "편안함"이라는 시대정신을 담았다는 평가다.',
    image_url: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&q=80',
    source_url: 'https://vogue.com',
    source_name: 'Vogue',
    published_at: new Date().toISOString(),
    keywords: ['모카무스', '팬톤2025', '브라운패션'],
  },
  {
    id: 'mock-4',
    category: 'retail',
    hook_title: '팝업이 브랜드의 새 본점이 됐다',
    summary:
      '뉴욕, 런던, 서울의 MZ 브랜드들이 고정 매장 없이 팝업만으로 연간 수십억을 버는 사례가 늘고 있다. 임대료 부담이 없고 SNS 바이럴 효과는 더 크다는 전략적 판단이다. 팝업은 더 이상 실험적 채널이 아닌 주력 유통 전략이 됐다.',
    image_url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=80',
    source_url: 'https://retaildive.com',
    source_name: 'Retail Dive',
    published_at: new Date().toISOString(),
    keywords: ['팝업스토어', '리테일테크', 'D2C브랜드'],
  },
  {
    id: 'mock-5',
    category: 'culture',
    hook_title: 'Z세대가 "조용한 사치"를 버린 이유',
    summary:
      '조용한 사치(Quiet Luxury) 트렌드가 정점을 찍고 반동이 시작됐다. Z세대 사이에서 화려한 로고와 맥시멀리즘이 다시 주목받고 있으며, 이를 "Loud Luxury"라 부른다. 트위터·틱톡에서 #loudluxury 태그가 급부상 중이며, 럭셔리 브랜드들은 캠페인 기조를 빠르게 바꾸고 있다.',
    image_url: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80',
    source_url: 'https://businessoffashion.com',
    source_name: 'BoF',
    published_at: new Date().toISOString(),
    keywords: ['맥시멀리즘', '로고플레이', 'Z세대패션'],
  },
  {
    id: 'mock-6',
    category: 'meme',
    hook_title: '이 밈, 마케터라면 알아야 한다',
    summary:
      '2025년 상반기를 강타한 "Brain Rot" 밈 문화가 광고 업계로 스며들기 시작했다. Duolingo, Ryanair 등 글로벌 브랜드들이 의도적으로 저품질·과장된 유머를 소셜 미디어 전략에 녹이고 있다. 진지한 브랜딩보다 공감 가는 밈 하나가 더 큰 바이럴 효과를 낸다는 게 입증됐다.',
    image_url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&q=80',
    source_url: 'https://reddit.com',
    source_name: 'Reddit',
    published_at: new Date().toISOString(),
    keywords: ['브레인롯', '유머광고', '소셜마케팅'],
  },
  {
    id: 'mock-7',
    category: 'tech',
    hook_title: '앱 없이 앱처럼: PWA의 역습',
    summary:
      '애플이 iOS 18에서 PWA(Progressive Web App) 지원을 대폭 강화하면서 앱스토어 우회 전략이 현실화되고 있다. 스포티파이, 핀터레스트 등 주요 서비스가 PWA 전환을 가속화 중이며, 앱 개발 비용이 줄어드는 만큼 스타트업에게 새로운 기회가 열린다.',
    image_url: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&q=80',
    source_url: 'https://wired.com',
    source_name: 'Wired',
    published_at: new Date().toISOString(),
    keywords: ['웹앱', 'PWA', '앱스토어우회'],
  },
  {
    id: 'mock-8',
    category: 'beauty',
    hook_title: '이 선크림, 왜 유독 아시아에서 잘 팔릴까?',
    summary:
      '한국과 일본의 선크림이 서구 뷰티 시장을 빠르게 잠식하고 있다. 가벼운 제형과 높은 SPF, 피부 미용 효과까지 더한 "스킨케어형 선크림"이 인기의 핵심이다. 세포라 베스트셀러 상위권을 K-뷰티 선크림이 장악하면서 글로벌 코스메틱 기업들이 한국 R&D팀 확충에 나섰다.',
    image_url: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&q=80',
    source_url: 'https://allure.com',
    source_name: 'Allure',
    published_at: new Date().toISOString(),
    keywords: ['선케어', 'K뷰티글로벌', '화장품R&D'],
  },
];
