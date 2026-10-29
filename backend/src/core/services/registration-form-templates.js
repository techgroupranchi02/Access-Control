/**
 * Pre-Built Industry Templates for Festival Delegate Registration Forms
 * Allows festival administrators to choose a base template and customize fields.
 */

const DEFAULT_FAQS = [
  {
    question: 'Welcome to the KASHISH x BENGALURU 2026 film festival',
    answer: '<p>Celebrate diversity and storytelling with a vibrant community of filmmakers, artists, and allies.</p><p>Get ready to experience <strong>44 spellbinding LGBTQ+ films</strong> from <strong>15 countries</strong>, join engaging panel discussions, participate in interactive Q&amp;A sessions with filmmakers, and enjoy captivating performances at the Opening Ceremony.</p><p>KASHISH Pride Film Festival, South Asia’s biggest LGBTQ+ film festival, comes to Bengaluru for the first time for a 3-day festival from <strong>November 20th to November 22nd, 2026</strong> at the <strong>National Gallery of Modern Art (NGMA)</strong>, Bengaluru.</p>'
  },
  {
    question: 'Important Pass Policy',
    answer: '<p><strong>Only ONE Festival Pass can be booked per person.</strong></p><p>To book multiple passes, please repeat the process for each individual attendee with their respective identification details.</p>'
  },
  {
    question: 'Who Can Attend (Eligibility & Verification)',
    answer: '<ul><li><strong>18+ Only:</strong> Only individuals 18 years and above (as of November 19, 2026) are permitted to attend the festival.</li><li><strong>Mandatory Registration:</strong> Registration is compulsory to access any film screenings, ceremonies, or panel discussions.</li><li><strong>Badge Access:</strong> Admission into all NGMA festival halls is reserved exclusively for pre-registered delegates holding a verified Festival Pass.</li><li><strong>Photo ID:</strong> Please carry a valid government-issued photo ID / age proof document for physical verification at the reception counter.</li></ul>'
  },
  {
    question: 'How to Get Your Festival Pass: Online & Spot Registration',
    answer: '<p><strong>1. ONLINE REGISTRATION</strong><br/>Register conveniently online via <strong>Freecomers</strong> on this page before arriving at the venue.<br/>Please present your digital pass or Serial Number along with a valid age proof document at the counter when collecting your physical pass badge.</p><p><strong>2. SPOT REGISTRATION</strong><br/>For individuals unable to register online beforehand, on-site manual spot registration will be available at the NGMA venue desk:<br/>• NGMA Reception Desk: November 20 – 22 | 10:15 AM – 5:30 PM</p>'
  },
  {
    question: 'Collecting Your Festival Pass (Badge Pickup & Timing)',
    answer: '<p>Physical Festival Passes can be picked up exclusively from the registration desk at <strong>NGMA</strong> during the following operational hours:</p><p><strong>Badge Collection Hours:</strong> November 20 – 22 | 10:15 AM – 6:00 PM</p><p><em>* Please carry your government-issued age proof document to present at the counter.</em></p>'
  },
  {
    question: 'How Audience Choice Voting Works',
    answer: '<p>Every registered delegate can rate each film in competition on a scale of <strong>1 to 5 stars</strong> after watching.</p><ul><li><strong>One verified rating per film</strong> per registered delegate.</li><li><strong>Bayesian Weighted Tabulation:</strong> We use an IMDb-inspired weighted rating formula with an adjustment number of <strong>10</strong>.</li><li><strong>Equal Competition:</strong> No minimum vote quorum is required — all films in competition are eligible for the Audience Choice Award.</li><li>Every valid rating counts toward the official standings!</li></ul>'
  },
  {
    question: 'Registration Queries & Assistance',
    answer: '<p>For any registration-related questions, please write to <a href="mailto:info@freecomers.com"><strong>info@freecomers.com</strong></a> or approach the registration desk volunteers at the entrance.</p>'
  }
];

const PREBUILT_TEMPLATES = {
  kashish_lgbtq: {
    template_key: 'kashish_lgbtq',
    name: 'KASHISH / LGBTQ+ Festival Template',
    description: 'Bespoke accreditation form with community affiliation, Trans* gender options, Mumbai festival history, and 18+ age certification.',
    badge_label: 'LGBTQ+ / Pride',
    form_title: 'KASHISH Delegate Registration',
    form_subtitle: 'Full-Festival & Day Pass Accreditation',
    policy_info: {
      title: 'DELEGATE PASS POLICY',
      icon: '🎟️',
      points: [
        'Full-Festival Pass is valid for all screenings on all days.',
        'Day Passes are valid only for individual days selected.',
        'Delegate Pass does NOT guarantee seating, which is first come, first served.',
        'Entry without Delegate Pass will be denied.'
      ],
      faq_text: 'Read all FAQs →',
      faqs: DEFAULT_FAQS
    },
    venue_info: {
      card_title: 'PASS COLLECTION AT VENUE:',
      venue: 'National Gallery of Modern Art (NGMA), Bengaluru',
      dates: 'Nov 20th to Nov 22nd, 2026',
      timing: '10:15 AM to 6:00 PM',
      instructions: 'Present this Serial Number along with a valid Government Photo ID at the NGMA Registration Desk to collect your printed badge with your official entry QR pass.'
    },
    fields: [
      {
        id: 'name',
        key: 'name',
        label: 'Full Name',
        type: 'text',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: 'Enter your full name as per Govt ID'
      },
      {
        id: 'email',
        key: 'email',
        label: 'Email Address',
        type: 'email',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: 'name@example.com'
      },
      {
        id: 'phone',
        key: 'phone',
        label: 'Mobile / WhatsApp Number',
        type: 'phone',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: '+91 98765 43210'
      },
      {
        id: 'dob',
        key: 'dob',
        label: 'Date of Birth',
        type: 'date',
        required: true,
        enabled: true,
        placeholder: 'DD/MM/YYYY',
        helper_text: 'For 18+ entry verification at the auditorium door'
      },
      {
        id: 'gender_identity',
        key: 'gender_identity',
        label: 'Gender Identity',
        type: 'radio',
        required: true,
        enabled: true,
        options: ['Male', 'Female', 'Trans*', 'Other'],
        default_value: 'Male'
      },
      {
        id: 'pass_type',
        key: 'pass_type',
        label: 'Pass Type',
        type: 'select',
        required: true,
        enabled: true,
        options: ['Full-Festival Pass', 'Day Pass'],
        default_value: 'Full-Festival Pass'
      },
      {
        id: 'pass_days',
        key: 'pass_days',
        label: 'Select Days Attending (if Day Pass)',
        type: 'multi_checkbox',
        required: false,
        enabled: true,
        options: ['NOV 20th', 'NOV 21st', 'NOV 22nd', 'All Days'],
        depends_on: { field: 'pass_type', value: 'Day Pass' }
      },
      {
        id: 'delegate_category',
        key: 'delegate_category',
        label: 'Delegate Category',
        type: 'select',
        required: true,
        enabled: true,
        options: [
          'Bangalore Attendee (AUDIENCE PASS)',
          'Festival Delegate (DELEGATE)',
          'VIP & Jury (VIP / JURY)',
          'Student Pass (STUDENT)',
          'Press & Media (PRESS)',
          'Accredited Filmmaker (FILMMAKER)'
        ],
        default_value: 'Bangalore Attendee (AUDIENCE PASS)'
      },
      {
        id: 'community_identity',
        key: 'community_identity',
        label: 'Community Affiliation',
        type: 'radio',
        required: false,
        enabled: true,
        options: ['A Proud LGBTQ+ person', 'An Ally', 'Still figuring out'],
        default_value: 'A Proud LGBTQ+ person'
      },
      {
        id: 'attended_mumbai',
        key: 'attended_mumbai',
        label: 'Did you attend KASHISH 2025 in Mumbai?',
        type: 'radio',
        required: false,
        enabled: true,
        options: ['Yes', 'No'],
        default_value: 'No'
      },
      {
        id: 'receive_updates',
        key: 'receive_updates',
        label: 'I would like to receive updates about future KASHISH events and festival announcements',
        type: 'checkbox',
        required: false,
        enabled: true,
        default_value: false
      },
      {
        id: 'appear_in_attendee_list',
        key: 'appear_in_attendee_list',
        label: 'I agree to appear in the registered festival delegate directory',
        type: 'checkbox',
        required: false,
        enabled: true,
        default_value: false
      },
      {
        id: 'certified_18_plus',
        key: 'certified_18_plus',
        label: 'I certify that I am 18 years of age or older and that the information provided above is true and correct.',
        type: 'legal_checkbox',
        required: true,
        enabled: true,
        default_value: false
      }
    ]
  },

  industry_market: {
    template_key: 'industry_market',
    name: 'Industry & Film Market Template',
    description: 'Designed for professional festivals, co-production markets, distributors, sales agents, and accredited press.',
    badge_label: 'Industry / Market',
    form_title: 'Industry & Market Accreditation',
    form_subtitle: 'Accreditation for Buyers, Sellers, Producers & Press',
    policy_info: {
      title: 'MARKET ACCREDITATION POLICY',
      icon: '💼',
      points: [
        'Market Badge provides access to Industry Lounge, Networking Sessions & Video Library.',
        'Industry Screenings require reservation or first-come priority queue.',
        'Badges are strictly non-transferable and photo ID is required onsite.',
        'Accreditation does not include Opening/Closing Gala without VIP invitation.'
      ],
      faq_text: 'Industry Accreditation FAQs →',
      faq_url: '/faqs'
    },
    venue_info: {
      card_title: 'INDUSTRY DESK COLLECTION:',
      venue: 'Palais des Festivals / Grand Convention Center',
      dates: 'Nov 18th to Nov 24th, 2026',
      timing: '9:00 AM to 7:00 PM Daily',
      instructions: 'Bring your company business card and government photo ID to the Industry Accreditation Desk.'
    },
    fields: [
      {
        id: 'name',
        key: 'name',
        label: 'Full Name',
        type: 'text',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: 'Enter full name'
      },
      {
        id: 'email',
        key: 'email',
        label: 'Official / Company Email',
        type: 'email',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: 'name@company.com'
      },
      {
        id: 'phone',
        key: 'phone',
        label: 'Mobile Number',
        type: 'phone',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: '+91 98765 43210'
      },
      {
        id: 'company_name',
        key: 'company_name',
        label: 'Company / Studio / Production House',
        type: 'text',
        required: true,
        enabled: true,
        placeholder: 'e.g. Dharma Productions, Netflix, Indie Banner'
      },
      {
        id: 'professional_role',
        key: 'professional_role',
        label: 'Professional Role',
        type: 'select',
        required: true,
        enabled: true,
        options: [
          'Producer',
          'Director',
          'Distributor / Sales Agent',
          'Film Buyer / Acquisition Executive',
          'Festival Programmer / Curator',
          'Film Critic / Press Journalist',
          'Screenwriter / Cinematographer',
          'Investor / Financier'
        ],
        default_value: 'Producer'
      },
      {
        id: 'industry_badge_tier',
        key: 'industry_badge_tier',
        label: 'Requested Badge Tier',
        type: 'select',
        required: true,
        enabled: true,
        options: ['Market Badge (Full Access)', 'Industry Pass (Screenings + Talks)', 'Press Accreditation (Media Only)'],
        default_value: 'Industry Pass (Screenings + Talks)'
      },
      {
        id: 'imdb_or_linkedin',
        key: 'imdb_or_linkedin',
        label: 'IMDb / LinkedIn Profile URL',
        type: 'text',
        required: false,
        enabled: true,
        placeholder: 'https://www.imdb.com/name/nm... or LinkedIn URL'
      },
      {
        id: 'market_interests',
        key: 'market_interests',
        label: 'Areas of Interest at the Market',
        type: 'multi_checkbox',
        required: false,
        enabled: true,
        options: [
          'Co-production Partnerships',
          'Distribution Rights',
          'Festival Submissions & Programming',
          'Post-Production & Tech',
          'Talent Scouting'
        ]
      },
      {
        id: 'receive_updates',
        key: 'receive_updates',
        label: 'Receive Industry Newsletter and daily market schedule updates',
        type: 'checkbox',
        required: false,
        enabled: true,
        default_value: true
      },
      {
        id: 'terms_agreement',
        key: 'terms_agreement',
        label: 'I agree to the Festival Industry Code of Conduct and Accreditation terms.',
        type: 'legal_checkbox',
        required: true,
        enabled: true,
        default_value: false
      }
    ]
  },

  student_academic: {
    template_key: 'student_academic',
    name: 'Student & Academic Festival Template',
    description: 'Tailored for university students, film school attendees, and academic delegations with student ID verification.',
    badge_label: 'Student / Academic',
    form_title: 'Student Delegate Registration',
    form_subtitle: 'Subsidized Delegate Pass for University & Film School Students',
    policy_info: {
      title: 'STUDENT DELEGATE POLICY',
      icon: '🎓',
      points: [
        'Student Pass valid only with physical, unexpired Student ID Card at venue entry.',
        'Full access to educational panels, masterclasses, and student competition blocks.',
        'Seating allocated on first-come, first-served basis behind priority delegations.',
        'Age limit: enrolled students aged 16 and above.'
      ],
      faq_text: 'Student Accreditation FAQs →',
      faq_url: '/faqs'
    },
    venue_info: {
      card_title: 'CAMPUS BADGE PICKUP:',
      venue: 'University Auditorium & Cultural Center',
      dates: 'Festival Dates: Oct 15th to Oct 18th, 2026',
      timing: '10:00 AM to 5:00 PM',
      instructions: 'Present your Student ID Card alongside this accreditation registration confirmation.'
    },
    fields: [
      {
        id: 'name',
        key: 'name',
        label: 'Student Full Name',
        type: 'text',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: 'Full Name as per Student ID'
      },
      {
        id: 'email',
        key: 'email',
        label: 'College or Personal Email',
        type: 'email',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: 'student@college.edu or name@gmail.com'
      },
      {
        id: 'phone',
        key: 'phone',
        label: 'Mobile Number',
        type: 'phone',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: '+91 98765 43210'
      },
      {
        id: 'college_name',
        key: 'college_name',
        label: 'College / University / Film Institute',
        type: 'text',
        required: true,
        enabled: true,
        placeholder: 'e.g. FTII, SRFTI, Ashoka University, Christ University'
      },
      {
        id: 'student_id_number',
        key: 'student_id_number',
        label: 'Student ID / Roll Number',
        type: 'text',
        required: true,
        enabled: true,
        placeholder: 'e.g. STU-2024-8841'
      },
      {
        id: 'course_department',
        key: 'course_department',
        label: 'Department / Major',
        type: 'select',
        required: true,
        enabled: true,
        options: [
          'Film & Television Direction',
          'Cinematography / Camera',
          'Editing & Sound Design',
          'Animation & VFX',
          'Journalism & Mass Communication',
          'Literature / Humanities',
          'Other'
        ],
        default_value: 'Film & Television Direction'
      },
      {
        id: 'year_of_study',
        key: 'year_of_study',
        label: 'Current Year of Study',
        type: 'select',
        required: true,
        enabled: true,
        options: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Post-Graduate / Masters', 'PhD / Research'],
        default_value: '1st Year'
      },
      {
        id: 'pass_type',
        key: 'pass_type',
        label: 'Student Pass Type',
        type: 'select',
        required: true,
        enabled: true,
        options: ['Full-Festival Student Pass (All Days)', 'Single Day Student Pass'],
        default_value: 'Full-Festival Student Pass (All Days)'
      },
      {
        id: 'certified_student',
        key: 'certified_student',
        label: 'I certify that I am a currently enrolled student and will present my valid Student Photo ID Card at physical badge collection.',
        type: 'legal_checkbox',
        required: true,
        enabled: true,
        default_value: false
      }
    ]
  },

  general_public: {
    template_key: 'general_public',
    name: 'General Public Film Festival Template',
    description: 'Clean and minimal registration form for audience members, film lovers, and community screening attendees.',
    badge_label: 'Audience / General',
    form_title: 'Festival Delegate Pass Registration',
    form_subtitle: 'Register for Screening Access & Balloting',
    policy_info: {
      title: 'AUDIENCE ENTRY POLICY',
      icon: '🎟️',
      points: [
        'Pass gives general admission entry to festival screening auditoriums.',
        'Auditorium doors close 10 minutes prior to scheduled screening time.',
        'Electronic devices and recording equipment are strictly prohibited.',
        'Pass must be worn or displayed at all times inside festival premises.'
      ],
      faq_text: 'General Attendee FAQs →',
      faq_url: '/faqs'
    },
    venue_info: {
      card_title: 'BOX OFFICE PASS COLLECTION:',
      venue: 'Main Festival Multiplex & Box Office',
      dates: 'Festival Run: Dec 1st to Dec 5th, 2026',
      timing: '11:00 AM to 9:00 PM',
      instructions: 'Present your booking confirmation barcode at any festival box office counter.'
    },
    fields: [
      {
        id: 'name',
        key: 'name',
        label: 'Full Name',
        type: 'text',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: 'Enter your full name'
      },
      {
        id: 'email',
        key: 'email',
        label: 'Email Address',
        type: 'email',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: 'name@example.com'
      },
      {
        id: 'phone',
        key: 'phone',
        label: 'Mobile Number',
        type: 'phone',
        required: true,
        enabled: true,
        is_core: true,
        placeholder: '+91 98765 43210'
      },
      {
        id: 'pass_type',
        key: 'pass_type',
        label: 'Pass Type',
        type: 'select',
        required: true,
        enabled: true,
        options: ['All-Access Festival Pass', 'Weekend Pass', 'Single Day Pass'],
        default_value: 'All-Access Festival Pass'
      },
      {
        id: 'city',
        key: 'city',
        label: 'City of Residence',
        type: 'text',
        required: false,
        enabled: true,
        placeholder: 'e.g. Bengaluru, Mumbai, Delhi'
      },
      {
        id: 'referral_source',
        key: 'referral_source',
        label: 'How did you hear about the festival?',
        type: 'select',
        required: false,
        enabled: true,
        options: [
          'Social Media (Instagram / Twitter / Facebook)',
          'Friend or Colleague',
          'Festival Poster or Flyer',
          'Film Club or Community',
          'Press / News Article',
          'Other'
        ],
        default_value: 'Social Media (Instagram / Twitter / Facebook)'
      },
      {
        id: 'receive_updates',
        key: 'receive_updates',
        label: 'Keep me informed about future screenings and festival events',
        type: 'checkbox',
        required: false,
        enabled: true,
        default_value: true
      },
      {
        id: 'terms_agreement',
        key: 'terms_agreement',
        label: 'I agree to the festival venue rules and audience screening guidelines.',
        type: 'legal_checkbox',
        required: true,
        enabled: true,
        default_value: false
      }
    ]
  }
};

/**
 * Get all available prebuilt templates list (summary metadata)
 */
function getAvailableTemplates() {
  return Object.values(PREBUILT_TEMPLATES).map(t => ({
    key: t.template_key,
    template_key: t.template_key,
    name: t.name,
    description: t.description,
    badge_label: t.badge_label,
    fields_count: t.fields.length
  }));
}

/**
 * Get a specific template by key
 */
function getTemplateByKey(key) {
  return PREBUILT_TEMPLATES[key] || PREBUILT_TEMPLATES.kashish_lgbtq;
}

module.exports = {
  PREBUILT_TEMPLATES,
  getAvailableTemplates,
  getTemplateByKey
};
