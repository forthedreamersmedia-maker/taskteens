/**
 * DEMONSTRATION DATA. Every employer, listing and applicant here is fictional and
 * flagged with is_demo = true so the UI labels it "Demo listing".
 * The same content is mirrored in supabase/seed.sql.
 */
import { CATEGORIES, CATEGORY_IMAGES, DEFAULT_SETTINGS, SERVICE_AREAS } from "../constants";
import type {
  Application,
  EmployerProfile,
  InterviewRequest,
  Job,
  Notification,
  TeenProfile,
  UserRow,
  VerificationRequest,
  AdminAuditLog,
  Report,
  ApplicationNote,
  SavedJob,
  EmailLogEntry,
  Block,
  Category,
  ServiceArea,
  PlatformSettings,
  EmployerReview,
  TeenFeedback,
} from "../types";

export const DEMO_PASSWORD = "demo1234";

export interface DemoDB {
  version: number;
  users: (UserRow & { password: string; email_verified: boolean })[];
  teen_profiles: TeenProfile[];
  employer_profiles: EmployerProfile[];
  jobs: Job[];
  applications: Application[];
  application_notes: ApplicationNote[];
  saved_jobs: SavedJob[];
  notifications: Notification[];
  interview_requests: InterviewRequest[];
  reports: Report[];
  verification_requests: VerificationRequest[];
  admin_audit_logs: AdminAuditLog[];
  blocks: Block[];
  employer_reviews: EmployerReview[];
  teen_feedback: TeenFeedback[];
  categories: Category[];
  service_areas: ServiceArea[];
  settings: PlatformSettings;
  outbox: EmailLogEntry[];
}

export const DEMO_DB_VERSION = 7;

const day = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
const dateOnly = (offsetDays: number) => iso(offsetDays).slice(0, 10);

export const DEMO_ACCOUNTS = [
  { email: "teen@demo.taskteens.com", role: "teen" as const, label: "Maya (teen worker)" },
  { email: "employer@demo.taskteens.com", role: "employer" as const, label: "Solano Paws (employer)" },
  { email: "admin@demo.taskteens.com", role: "admin" as const, label: "Platform admin" },
];

function user(id: string, email: string, full_name: string, role: UserRow["role"], created: number, phone: string | null = null) {
  return { id, email, full_name, role, status: "active" as const, phone, created_at: iso(created), password: DEMO_PASSWORD, email_verified: true };
}

function employer(
  user_id: string,
  display_name: string,
  employer_type: EmployerProfile["employer_type"],
  city: string,
  service_area: string,
  verification_status: EmployerProfile["verification_status"],
  description: string,
  website: string | null = null,
): EmployerProfile {
  return {
    user_id,
    employer_type,
    display_name,
    city,
    service_area,
    website,
    description,
    logo_url: null,
    verification_status,
    agreed_to_rules_at: iso(-40),
    onboarded: true,
    created_at: iso(-40),
    updated_at: iso(-10),
  };
}

type JobSeed = Partial<Job> & Pick<Job, "id" | "employer_id" | "title" | "category" | "city" | "pay_min" | "pay_type" | "schedule">;

function job(j: JobSeed, postedDaysAgo: number): Job {
  return {
    description: "",
    responsibilities: [],
    required_skills: [],
    preferred_skills: [],
    neighborhood: null,
    opportunity_type: "job",
    nonprofit_attested: false,
    service_area: j.city.toLowerCase().replace(/\s+/g, "-"),
    work_mode: "in_person",
    pay_max: null,
    schedule_tags: [],
    min_age: 14,
    start_date: dateOnly(7),
    recurrence: "recurring",
    openings: 1,
    deadline: dateOnly(21),
    transportation: "bike_or_walk",
    transportation_notes: null,
    image_url: CATEGORY_IMAGES[j.category] ?? null,
    status: "published",
    moderation_status: "approved",
    featured: false,
    is_demo: true,
    created_at: iso(-postedDaysAgo),
    updated_at: iso(-postedDaysAgo),
    published_at: iso(-postedDaysAgo),
    ...j,
  };
}

const PAST_TEENS = [
  { id: "u_teen_past1", email: "past1@demo.taskteens.com", name: "Demo Worker A.", city: "Albany" },
  { id: "u_teen_past2", email: "past2@demo.taskteens.com", name: "Demo Worker B.", city: "Berkeley" },
  { id: "u_teen_past3", email: "past3@demo.taskteens.com", name: "Demo Worker C.", city: "El Cerrito" },
  { id: "u_teen_past4", email: "past4@demo.taskteens.com", name: "Demo Worker D.", city: "Berkeley" },
  { id: "u_teen_past5", email: "past5@demo.taskteens.com", name: "Demo Worker E.", city: "Albany" },
  { id: "u_teen_past6", email: "past6@demo.taskteens.com", name: "Demo Worker F.", city: "El Cerrito" },
];

export function buildSeed(): DemoDB {
  const users = [
    user("u_teen_maya", "teen@demo.taskteens.com", "Maya Rodriguez", "teen", -30, "(510) 555-0142"),
    user("u_teen_jordan", "jordan@demo.taskteens.com", "Jordan Lee", "teen", -25, "(510) 555-0177"),
    user("u_teen_aisha", "aisha@demo.taskteens.com", "Aisha Patel", "teen", -12, "(510) 555-0190"),
    user("u_emp_solano", "employer@demo.taskteens.com", "Dana Whitfield", "employer", -45, "(510) 555-0101"),
    user("u_emp_nguyen", "nguyen@demo.taskteens.com", "Linh Nguyen", "employer", -38, "(510) 555-0112"),
    user("u_emp_plaza", "plaza@demo.taskteens.com", "Sam Okafor", "employer", -60, "(510) 555-0123"),
    user("u_emp_elmwood", "elmwood@demo.taskteens.com", "Priya Raman", "employer", -20, "(510) 555-0134"),
    user("u_emp_rivera", "rivera@demo.taskteens.com", "Carlos Rivera", "employer", -15, "(510) 555-0145"),
    user("u_emp_gilman", "gilman@demo.taskteens.com", "Mei Chen", "employer", -50, "(510) 555-0156"),
    user("u_emp_bayside", "bayside@demo.taskteens.com", "Tom Alvarez", "employer", -9, "(510) 555-0167"),
    user("u_admin", "admin@demo.taskteens.com", "TaskTeens Admin", "admin", -90),
    // Fictional past workers, so demo employers have completed-job history and ratings.
    ...PAST_TEENS.map((t, i) => user(t.id, t.email, t.name, "teen" as const, -120 + i)),
  ];

  const employer_profiles: EmployerProfile[] = [
    employer("u_emp_solano", "Solano Paws Dog Walking", "business", "Albany", "albany", "verified",
      "Small neighborhood dog-walking service around Solano Ave. We pair teen walkers with calm, friendly dogs and always do a first walk together.", "https://example.com/solano-paws"),
    employer("u_emp_nguyen", "The Nguyen Family", "individual", "Berkeley", "berkeley", "pending",
      "North Berkeley family with two kids (ages 7 and 10) looking for reliable after-school help while a parent works from home."),
    employer("u_emp_plaza", "Plaza Corner Books", "business", "El Cerrito", "el-cerrito", "verified",
      "Independent used bookstore near El Cerrito Plaza. We love hiring local students who like books and people.", "https://example.com/plaza-corner-books"),
    employer("u_emp_elmwood", "Elmwood Learning Collective", "business", "Berkeley", "berkeley", "pending",
      "Parent-run tutoring collective that matches strong high-school students with elementary and middle-school learners."),
    employer("u_emp_rivera", "Rivera Household", "individual", "El Cerrito", "el-cerrito", "unverified",
      "Hillside home with a big backyard garden. Looking for help with seasonal yard work."),
    employer("u_emp_gilman", "Gilman Street Café", "business", "Berkeley", "berkeley", "verified",
      "Neighborhood café in West Berkeley serving coffee, pastries and lunch. Weekend shifts for dependable teens.", "https://example.com/gilman-cafe"),
    employer("u_emp_bayside", "Bayside Community Events", "business", "Albany", "albany", "unverified",
      "Volunteer-led organizer of farmers-market pop-ups and school fundraisers across Albany and El Cerrito."),
  ];

  const jobs: Job[] = [
    job({
      id: "job_dog_walker_solano", employer_id: "u_emp_solano", title: "After-school dog walker", category: "pet-care", city: "Albany",
      neighborhood: "Solano Ave area", pay_min: 18, pay_max: 20, pay_type: "hourly", schedule: "Mon/Wed/Fri, 3:30–5:00 pm",
      schedule_tags: ["weekday", "afternoon"], min_age: 14, openings: 2, featured: true,
      description: "Walk two to four friendly, leash-trained dogs on a set route near Solano Avenue. You'll always start with a paired training walk alongside our lead walker, and we text you each dog's notes before every shift.",
      responsibilities: ["Pick up dogs from homes along a set route", "30–45 minute group walks on sidewalks and in Memorial Park", "Refresh water bowls and log each walk in our app", "Report anything unusual to the lead walker right away"],
      required_skills: ["Reliable", "Comfortable with dogs"], preferred_skills: ["Pet first aid", "Past pet care"], transportation: "bike_or_walk",
      transportation_notes: "Route starts near Solano & Masonic. Walkable from Albany High.",
    }, 2),
    job({
      id: "job_pet_sitter_weekend", employer_id: "u_emp_solano", title: "Weekend pet-sitting visits", category: "pet-care", city: "Albany",
      neighborhood: "Albany Hill", pay_min: 25, pay_type: "flat", schedule: "Sat & Sun mornings, ~45 min per visit", schedule_tags: ["weekend", "morning"],
      min_age: 16, recurrence: "recurring",
      description: "Drop-in visits for cats and small dogs while their owners are away for the weekend. Feed, refresh water, scoop litter and send the owner a photo update.",
      responsibilities: ["Follow each pet's care card", "Send a photo update to the owner after each visit", "Lock up and confirm departure in the app"],
      required_skills: ["Responsible", "Detail-oriented"], preferred_skills: ["Cat experience"],
    }, 6),
    job({
      id: "job_parents_helper_nberk", employer_id: "u_emp_nguyen", title: "Parent's helper (after school)", category: "childcare-support", city: "Berkeley",
      neighborhood: "North Berkeley", pay_min: 19, pay_max: 21, pay_type: "hourly", schedule: "Tue & Thu, 3:00–6:00 pm", schedule_tags: ["weekday", "afternoon"],
      min_age: 16, featured: true, transportation: "transit_accessible", transportation_notes: "A few blocks from the North Berkeley BART station.",
      description: "Help two kids with homework, snacks and outdoor play while a parent is working from home in the next room. A parent is always home during your shift.",
      responsibilities: ["Homework help (2nd and 5th grade)", "Prepare a simple snack", "Board games, drawing, backyard play", "Light tidy-up of play areas"],
      required_skills: ["Patient", "Good with kids"], preferred_skills: ["CPR/First aid", "Spanish or Vietnamese"],
    }, 3),
    job({
      id: "job_bookstore_clerk", employer_id: "u_emp_plaza", title: "Bookstore shelving & front-counter help", category: "restaurant-retail", city: "El Cerrito",
      neighborhood: "El Cerrito Plaza area", pay_min: 18.5, pay_type: "hourly", schedule: "Saturdays 10 am–2 pm + one weekday afternoon",
      schedule_tags: ["weekend", "weekday", "afternoon"], min_age: 15, openings: 1, featured: true, transportation: "transit_accessible",
      transportation_notes: "Two blocks from El Cerrito Plaza BART.",
      description: "Shelve new arrivals, help customers find books, and keep the store welcoming. Great first job for readers who like talking about books.",
      responsibilities: ["Sort and shelve donations", "Greet customers and answer questions", "Help with the register under supervision", "Keep displays neat"],
      required_skills: ["Friendly", "Organized"], preferred_skills: ["Loves reading"],
    }, 1),
    job({
      id: "job_math_tutor", employer_id: "u_emp_elmwood", title: "Middle-school math tutor", category: "tutoring", city: "Berkeley",
      neighborhood: "Elmwood", pay_min: 22, pay_max: 26, pay_type: "hourly", schedule: "2 afternoons/week, 4:00–5:30 pm", schedule_tags: ["weekday", "afternoon"],
      min_age: 16, work_mode: "hybrid", transportation: "transit_accessible",
      description: "Tutor 6th–8th graders in pre-algebra and algebra, either at the Claremont branch library or over video. We provide lesson guides and a coordinator checks in weekly.",
      responsibilities: ["Run 45-minute sessions from our lesson guides", "Track progress in a shared sheet", "Communicate with our coordinator (not directly with families)"],
      required_skills: ["Strong in Algebra I", "Patient explainer"], preferred_skills: ["Tutoring experience", "Bilingual"],
    }, 4),
    job({
      id: "job_reading_buddy", employer_id: "u_emp_elmwood", title: "Reading buddy for 1st graders", category: "tutoring", city: "Berkeley",
      neighborhood: "Elmwood", pay_min: 20, pay_type: "hourly", schedule: "Wednesdays 3:30–4:30 pm", schedule_tags: ["weekday", "afternoon"], min_age: 14,
      description: "Read aloud and practice phonics with early readers in small groups, supervised by an adult coordinator.",
      responsibilities: ["Read with 2–3 students per session", "Use provided phonics games", "Share quick notes with the coordinator"],
      required_skills: ["Encouraging", "Clear reader"],
    }, 9),
    job({
      id: "job_yard_cleanup", employer_id: "u_emp_rivera", title: "Fall yard cleanup (one weekend)", category: "yard-work", city: "El Cerrito",
      neighborhood: "El Cerrito Hills", pay_min: 120, pay_type: "flat", schedule: "One Saturday, about 6 hours with a lunch break", schedule_tags: ["weekend", "morning"],
      min_age: 15, recurrence: "one_time", openings: 2, start_date: dateOnly(10), deadline: dateOnly(8), transportation: "own_transportation",
      transportation_notes: "Hillside street — no nearby bus stop. A ride or bike needed.",
      description: "Rake leaves, pull weeds and bag green waste in a large backyard. Tools, gloves and lunch provided. An adult will be home and working alongside you.",
      responsibilities: ["Rake and bag leaves", "Weed garden beds", "Haul bags to the curb"],
      required_skills: ["Comfortable with physical work"],
    }, 5),
    job({
      id: "job_barista_weekend", employer_id: "u_emp_gilman", title: "Weekend café counter assistant", category: "restaurant-retail", city: "Berkeley",
      neighborhood: "West Berkeley", pay_min: 19.5, pay_max: 21, pay_type: "hourly", schedule: "Sat & Sun, 8 am–1 pm", schedule_tags: ["weekend", "morning"],
      min_age: 16, openings: 2, featured: true, transportation: "transit_accessible",
      description: "Take orders, serve pastries, bus tables and keep the counter spotless during our busy weekend brunch rush. We train you on everything — no experience needed.",
      responsibilities: ["Greet customers and take orders", "Plate pastries and run food", "Bus and sanitize tables", "Restock cups, lids and napkins"],
      required_skills: ["Friendly", "Works well under pressure"], preferred_skills: ["Food handler card", "Customer service"],
    }, 1),
    job({
      id: "job_social_media", employer_id: "u_emp_gilman", title: "Café photos & Instagram posts", category: "photo-content", city: "Berkeley",
      neighborhood: "West Berkeley", pay_min: 150, pay_type: "flat", schedule: "Flexible — 4 posts per month", schedule_tags: ["flexible"], min_age: 15,
      work_mode: "hybrid",
      description: "Shoot bright, appetizing photos of our menu and space once a month, then draft four captioned posts for our manager to approve and publish.",
      responsibilities: ["One on-site photo session per month", "Edit photos to a consistent style", "Draft captions; manager approves and posts"],
      required_skills: ["Photography", "Photo editing"], preferred_skills: ["Lightroom", "Canva"],
    }, 7),
    job({
      id: "job_event_setup", employer_id: "u_emp_bayside", title: "Farmers-market pop-up setup crew", category: "event-assistance", city: "Albany",
      neighborhood: "Central Albany", pay_min: 18, pay_type: "hourly", schedule: "Select Saturdays, 7:30–11:30 am", schedule_tags: ["weekend", "morning"], min_age: 14,
      openings: 4,
      description: "Set up canopies, tables and signage for a community pop-up market, then help vendors unload. Adult crew leads on site at all times.",
      responsibilities: ["Set up canopies and tables", "Put out signage", "Help with teardown and cleanup"],
      required_skills: ["On time", "Team player"],
    }, 3),
    job({
      id: "job_tech_help_seniors", employer_id: "u_emp_bayside", title: "Tech help desk at community fundraiser", category: "tech-help", city: "El Cerrito",
      neighborhood: "Del Norte area", pay_min: 80, pay_type: "stipend", schedule: "One Sunday, 12–4 pm", schedule_tags: ["weekend", "afternoon"], min_age: 14,
      recurrence: "one_time", start_date: dateOnly(14), transportation: "transit_accessible",
      description: "Staff a friendly 'Ask a Teen' table helping older neighbors with phone settings, photos, video calls and email at a community center fundraiser.",
      responsibilities: ["Help attendees one-on-one with phones and tablets", "Explain things patiently and simply", "Never handle anyone's passwords — coach them to type their own"],
      required_skills: ["Comfortable with iPhone and Android"], preferred_skills: ["Patient teacher"],
    }, 2),
    job({
      id: "job_volunteer_creek_cleanup", employer_id: "u_emp_bayside", title: "Creek & park cleanup volunteer", category: "yard-work", city: "Albany",
      opportunity_type: "volunteer", nonprofit_attested: true,
      neighborhood: "Albany Hill", pay_min: 0, pay_type: "unpaid", schedule: "One Saturday, 9 am–12 pm", schedule_tags: ["weekend", "morning"], min_age: 14,
      recurrence: "one_time", start_date: dateOnly(10), openings: 12,
      description: "Join a community cleanup along the creek path and park. Gloves, grabbers and snacks provided. Adult volunteer leads run check-in and stay with every group. We can sign off on community-service hours for your school.",
      responsibilities: ["Pick up litter along marked trail sections", "Sort recycling from trash", "Stay with your assigned group"],
      required_skills: ["Closed-toe shoes"], preferred_skills: ["Bring a friend"],
    }, 1),
    job({
      id: "job_volunteer_homework_club", employer_id: "u_emp_elmwood", title: "Homework club volunteer helper", category: "tutoring", city: "Berkeley",
      opportunity_type: "volunteer", nonprofit_attested: true,
      neighborhood: "Elmwood", pay_min: 0, pay_type: "unpaid", schedule: "Mondays 3:30–5 pm", schedule_tags: ["weekday", "afternoon"], min_age: 14, openings: 3,
      description: "Help elementary students with reading and math practice at our free after-school homework club. Staff coordinators are in the room the whole time. Service-hour forms signed on request.",
      responsibilities: ["Read with students one-on-one", "Help with worksheets", "Keep the table tidy"],
      required_skills: ["Patient", "Encouraging"],
    }, 2),
    job({
      id: "job_internship_bookstore", employer_id: "u_emp_plaza", title: "Small-business internship (bookselling & marketing)", category: "restaurant-retail", city: "El Cerrito",
      opportunity_type: "internship",
      neighborhood: "El Cerrito Plaza area", pay_min: 400, pay_type: "stipend", schedule: "8 weeks, 5 hrs/week (flexible)", schedule_tags: ["flexible", "weekday"], min_age: 16,
      recurrence: "recurring", start_date: dateOnly(18), openings: 2,
      description: "Learn how an independent bookstore runs: ordering, displays, social posts and a small end-of-summer project you present to the owner. Paid stipend for the full 8 weeks, and a reference letter when you finish.",
      responsibilities: ["Shadow the owner on ordering and inventory", "Design one front-table display", "Plan and post a month of social content", "Present a short final project"],
      required_skills: ["Curious", "Reliable"], preferred_skills: ["Canva or design basics"],
    }, 1),
    job({
      id: "job_moving_boxes", employer_id: "u_emp_nguyen", title: "Garage organizing & donation run prep", category: "household-help", city: "Berkeley",
      neighborhood: "North Berkeley", pay_min: 20, pay_type: "hourly", schedule: "One Sunday afternoon, ~4 hours", schedule_tags: ["weekend", "afternoon"], min_age: 15,
      recurrence: "one_time", start_date: dateOnly(12),
      description: "Help sort a cluttered garage into keep / donate / recycle piles and pack donation boxes. Family members work alongside you.",
      responsibilities: ["Sort items into labeled piles", "Pack and label donation boxes", "Sweep up when finished"],
      required_skills: ["Organized"],
    }, 8),
    job({
      id: "job_data_entry", employer_id: "u_emp_plaza", title: "Inventory spreadsheet assistant", category: "admin-work", city: "El Cerrito",
      neighborhood: "El Cerrito Plaza area", pay_min: 18.5, pay_type: "hourly", schedule: "Flexible, 4–6 hrs/week", schedule_tags: ["flexible", "weekday"], min_age: 16,
      work_mode: "remote", transportation: "none_needed",
      description: "Enter book titles, ISBNs and conditions into our inventory spreadsheet from photos we upload. Mostly remote with an occasional in-store check-in.",
      responsibilities: ["Enter inventory data accurately", "Flag duplicates", "Weekly progress note"],
      required_skills: ["Google Sheets", "Accurate typing"],
    }, 11),
    job({
      id: "job_garden_watering", employer_id: "u_emp_rivera", title: "Summer-style garden watering (2 weeks)", category: "yard-work", city: "El Cerrito",
      neighborhood: "El Cerrito Hills", pay_min: 15, pay_type: "flat", schedule: "Daily evening visit, 20 min, for 2 weeks", schedule_tags: ["evening"], min_age: 14,
      recurrence: "one_time", transportation: "own_transportation", status: "published",
      description: "Water vegetable beds and potted plants while the family travels. Per-visit flat pay.",
      responsibilities: ["Water all beds and pots", "Check hose timer", "Text a photo each evening"],
      required_skills: ["Reliable"],
    }, 13),
    // Non-public examples to show draft/pending states in dashboards
    job({
      id: "job_draft_solano", employer_id: "u_emp_solano", title: "Puppy socialization helper", category: "pet-care", city: "Albany", neighborhood: "Solano Ave area",
      pay_min: 18, pay_type: "hourly", schedule: "Sundays 10–11:30 am", schedule_tags: ["weekend", "morning"], status: "draft", moderation_status: "pending",
      description: "Help run a weekly puppy playgroup: greet owners, supervise play and sanitize the space afterwards.", responsibilities: ["Greet owners", "Supervise play"], published_at: null,
    }, 1),
    job({
      id: "job_pending_bayside", employer_id: "u_emp_bayside", title: "School fundraiser check-in table", category: "event-assistance", city: "Albany",
      neighborhood: "Central Albany", pay_min: 60, pay_type: "stipend", schedule: "One Friday evening, 5–8 pm", schedule_tags: ["evening"], recurrence: "one_time",
      status: "published", moderation_status: "pending",
      description: "Check guests in at a school auction and hand out bid numbers. Adult volunteer leads on site.", responsibilities: ["Check guests in", "Hand out bid paddles"],
    }, 0),
  ];

  const teen_profiles: TeenProfile[] = [
    {
      user_id: "u_teen_maya", display_name: "Maya R.", age_range: "16-17", city: "Albany", bio: "Junior who loves animals, photography and helping out at my family's events.",
      skills: ["Pet care", "Photography", "Customer service"], experience: "Pet-sat for three neighbors; volunteer at the Albany library summer reading program.",
      availability: { mon: ["afternoon"], wed: ["afternoon"], fri: ["afternoon"], sat: ["morning", "afternoon"] }, transportation: "bike_or_walk",
      resume_path: null, resume_name: null, portfolio_url: "https://example.com/maya-photos", work_permit_status: "in_progress", guardian_consent_status: "obtained",
      email_notifications: true, created_at: iso(-30), updated_at: iso(-3),
    },
    {
      user_id: "u_teen_jordan", display_name: "Jordan L.", age_range: "16-17", city: "Berkeley", bio: null, skills: ["Customer service", "Math"],
      experience: "Math club captain; helped at a family friend's food truck.", availability: { sat: ["morning"], sun: ["morning"] }, transportation: "transit_accessible",
      resume_path: null, resume_name: null, portfolio_url: null, work_permit_status: "have_permit", guardian_consent_status: "obtained", email_notifications: true,
      created_at: iso(-25), updated_at: iso(-25),
    },
    {
      user_id: "u_teen_aisha", display_name: "Aisha P.", age_range: "14-15", city: "El Cerrito", bio: null, skills: ["Reading", "Organized"],
      experience: "Reading buddy at my middle school library.", availability: { wed: ["afternoon"] }, transportation: "bike_or_walk",
      resume_path: null, resume_name: null, portfolio_url: null, work_permit_status: "not_sure", guardian_consent_status: "obtained", email_notifications: true,
      created_at: iso(-12), updated_at: iso(-12),
    },
  ];

  const baseApp = {
    resume_path: null, resume_name: null, portfolio_url: null, agreed_to_safety_rules: true, viewed_at: null,
    completed_at: null as string | null, completed_by: null as Application["completed_by"],
    work_permit_status: "have_permit" as const, guardian_consent_status: "obtained" as const,
  };

  const applications: Application[] = [
    {
      ...baseApp, id: "app_jordan_dog", job_id: "job_dog_walker_solano", employer_id: "u_emp_solano", teen_id: "u_teen_jordan", status: "submitted",
      applicant_name: "Jordan Lee", applicant_email: "jordan@demo.taskteens.com", applicant_phone: "(510) 555-0177", age_range: "16-17", city: "Berkeley",
      experience: "Walked my neighbor's two labs every day last summer.", skills: ["Reliable", "Comfortable with dogs"], availability: "Mon, Wed, Fri after 3:15 pm",
      transportation: "transit_accessible", interest_statement: "I love dogs and I'm looking for a steady after-school job close to school. I'm always on time.",
      status_updated_at: iso(-1), created_at: iso(-1),
    },
    {
      ...baseApp, id: "app_aisha_petsit", job_id: "job_pet_sitter_weekend", employer_id: "u_emp_solano", teen_id: "u_teen_aisha", status: "viewed",
      applicant_name: "Aisha Patel", applicant_email: "aisha@demo.taskteens.com", applicant_phone: "(510) 555-0190", age_range: "14-15", city: "El Cerrito",
      experience: "Take care of our family cat and my aunt's rabbits when she travels.", skills: ["Responsible", "Cat experience"], availability: "Weekend mornings",
      transportation: "bike_or_walk", interest_statement: "I'm careful and responsible with animals and would love to start building work experience on weekends.",
      work_permit_status: "not_sure", viewed_at: iso(-2), status_updated_at: iso(-2), created_at: iso(-4),
    },
    {
      ...baseApp, id: "app_maya_books", job_id: "job_bookstore_clerk", employer_id: "u_emp_plaza", teen_id: "u_teen_maya", status: "interview_requested",
      applicant_name: "Maya Rodriguez", applicant_email: "teen@demo.taskteens.com", applicant_phone: "(510) 555-0142", age_range: "16-17", city: "Albany",
      experience: "Library summer reading volunteer; organized our school book swap.", skills: ["Friendly", "Organized", "Loves reading"],
      availability: "Saturdays, plus Wednesday afternoons", transportation: "transit_accessible",
      interest_statement: "Plaza Corner Books is one of my favorite places. I'd love to help other people find books they'll love.",
      work_permit_status: "in_progress", viewed_at: iso(-1), status_updated_at: iso(-1), created_at: iso(-3),
    },
    {
      ...baseApp, id: "app_maya_cafe", job_id: "job_barista_weekend", employer_id: "u_emp_gilman", teen_id: "u_teen_maya", status: "submitted",
      applicant_name: "Maya Rodriguez", applicant_email: "teen@demo.taskteens.com", applicant_phone: "(510) 555-0142", age_range: "16-17", city: "Albany",
      experience: "Helped run the snack table at school events.", skills: ["Friendly", "Customer service"], availability: "Sat & Sun mornings",
      transportation: "transit_accessible", interest_statement: "I want to learn how a real café runs and I'm great with people during busy rushes.",
      work_permit_status: "in_progress", status_updated_at: iso(0), created_at: iso(0),
    },
  ];

  // ---- completed jobs (demo history) -------------------------------------------------
  type Past = { id: string; job: string; emp: string; teen: string; daysAgo: number; review?: [number, boolean, boolean, boolean, boolean]; feedback?: [boolean, boolean, boolean] };
  const past: Past[] = [
    // Plaza Corner Books: 6 completed, 6 reviews, no open reports → "Reliable Employer"
    { id: "app_p1_books", job: "job_bookstore_clerk", emp: "u_emp_plaza", teen: "u_teen_past1", daysAgo: 70, review: [5, true, true, true, true], feedback: [true, true, true] },
    { id: "app_p2_books", job: "job_bookstore_clerk", emp: "u_emp_plaza", teen: "u_teen_past2", daysAgo: 62, review: [5, true, true, true, true] },
    { id: "app_p3_books", job: "job_bookstore_clerk", emp: "u_emp_plaza", teen: "u_teen_past3", daysAgo: 55, review: [4, true, false, true, true] },
    { id: "app_p4_data", job: "job_data_entry", emp: "u_emp_plaza", teen: "u_teen_past4", daysAgo: 48, review: [5, true, true, true, true] },
    { id: "app_p5_data", job: "job_data_entry", emp: "u_emp_plaza", teen: "u_teen_past5", daysAgo: 40, review: [5, true, true, true, true] },
    { id: "app_p6_data", job: "job_data_entry", emp: "u_emp_plaza", teen: "u_teen_past6", daysAgo: 33, review: [5, true, true, true, true] },
    // Solano Paws: 3 reviews → score shown, not yet Reliable
    { id: "app_p1_dog", job: "job_dog_walker_solano", emp: "u_emp_solano", teen: "u_teen_past1", daysAgo: 45, review: [5, true, true, true, true], feedback: [true, true, true] },
    { id: "app_p2_dog", job: "job_dog_walker_solano", emp: "u_emp_solano", teen: "u_teen_past2", daysAgo: 30, review: [4, true, true, true, true] },
    { id: "app_p3_pet", job: "job_pet_sitter_weekend", emp: "u_emp_solano", teen: "u_teen_past3", daysAgo: 21, review: [5, true, true, true, true] },
    // Solano Paws: completed, waiting on the employer's private feedback (try it as the demo employer)
    { id: "app_p4_pet", job: "job_pet_sitter_weekend", emp: "u_emp_solano", teen: "u_teen_past4", daysAgo: 6 },
    // Gilman café: 2 reviews → "New on TaskTeens" (score hidden until 3)
    { id: "app_p4_cafe", job: "job_barista_weekend", emp: "u_emp_gilman", teen: "u_teen_past4", daysAgo: 28, review: [4, true, true, true, true] },
    { id: "app_p5_social", job: "job_social_media", emp: "u_emp_gilman", teen: "u_teen_past5", daysAgo: 19, review: [5, true, true, true, true] },
  ];
  for (const p of past) {
    const t = PAST_TEENS.find((x) => x.id === p.teen)!;
    applications.push({
      ...baseApp, id: p.id, job_id: p.job, employer_id: p.emp, teen_id: p.teen, status: "selected",
      applicant_name: t.name, applicant_email: t.email, applicant_phone: "(510) 555-0100", age_range: "16-17", city: t.city,
      experience: "Demo past worker.", skills: ["Reliable"], availability: "Weekends", transportation: "bike_or_walk",
      interest_statement: "Demonstration application used to show completed-job history.",
      viewed_at: iso(-p.daysAgo - 5), status_updated_at: iso(-p.daysAgo - 4), created_at: iso(-p.daysAgo - 7),
      completed_at: iso(-p.daysAgo), completed_by: "employer",
    });
  }
  // Maya (demo teen): one finished job ready to rate, one selected job still in progress.
  applications.push(
    {
      ...baseApp, id: "app_maya_yard", job_id: "job_yard_cleanup", employer_id: "u_emp_rivera", teen_id: "u_teen_maya", status: "selected",
      applicant_name: "Maya Rodriguez", applicant_email: "teen@demo.taskteens.com", applicant_phone: "(510) 555-0142", age_range: "16-17", city: "Albany",
      experience: "Help with our family garden every fall.", skills: ["Hard-working", "Outdoors"], availability: "Saturday", transportation: "transit_accessible",
      interest_statement: "I'm happy to work outside and I'm free that weekend.", work_permit_status: "in_progress",
      viewed_at: iso(-9), status_updated_at: iso(-8), created_at: iso(-10), completed_at: iso(-2), completed_by: "employer",
    },
    {
      ...baseApp, id: "app_maya_event", job_id: "job_event_setup", employer_id: "u_emp_bayside", teen_id: "u_teen_maya", status: "selected",
      applicant_name: "Maya Rodriguez", applicant_email: "teen@demo.taskteens.com", applicant_phone: "(510) 555-0142", age_range: "16-17", city: "Albany",
      experience: "Set up and cleaned up for our school's spring fair.", skills: ["Teamwork", "Early riser"], availability: "Saturday mornings", transportation: "transit_accessible",
      interest_statement: "I like busy mornings and helping events run smoothly.", work_permit_status: "in_progress",
      viewed_at: iso(-5), status_updated_at: iso(-4), created_at: iso(-6),
    },
  );

  const employer_reviews: EmployerReview[] = past
    .filter((p) => p.review)
    .map((p) => {
      const [stars, paid, matched, safe, respectful] = p.review!;
      return {
        id: `rev_${p.id.slice(4)}`, application_id: p.id, job_id: p.job, employer_id: p.emp, teen_id: p.teen, stars,
        paid_as_promised: paid, matched_listing: matched, felt_safe: safe, respectful, private_note: null, status: "published" as const,
        created_at: iso(-p.daysAgo + 1),
      };
    });
  const teen_feedback: TeenFeedback[] = past
    .filter((p) => p.feedback)
    .map((p) => ({
      id: `tfb_${p.id.slice(4)}`, application_id: p.id, job_id: p.job, employer_id: p.emp, teen_id: p.teen,
      showed_up: p.feedback![0], communicated: p.feedback![1], completed_job: p.feedback![2], note: null, created_at: iso(-p.daysAgo + 1),
    }));

  const interview_requests: InterviewRequest[] = [
    {
      id: "int_maya_books", application_id: "app_maya_books", job_id: "job_bookstore_clerk", employer_id: "u_emp_plaza", teen_id: "u_teen_maya",
      proposed_times: [iso(3).slice(0, 11) + "23:00:00.000Z", iso(4).slice(0, 11) + "00:30:00.000Z"], confirmed_time: null, format: "in_person_public",
      location_note: "At the bookstore, during open hours (public storefront)", message: "Hi Maya — we'd love to meet you for a quick 15-minute chat. A parent or guardian is welcome to come along.",
      guardian_invited: true, status: "proposed", created_at: iso(-1), updated_at: iso(-1),
    },
  ];

  const notifications: Notification[] = [
    { id: "n1", user_id: "u_teen_maya", kind: "interview_requested", title: "Interview requested", body: "Plaza Corner Books would like to schedule a short interview for “Bookstore shelving & front-counter help”.", link: "/dashboard/teen/interviews", read_at: null, created_at: iso(-1) },
    { id: "n2", user_id: "u_teen_maya", kind: "application_status", title: "Application viewed", body: "Plaza Corner Books viewed your application.", link: "/dashboard/teen/applications", read_at: iso(-1), created_at: iso(-1.2) },
    { id: "n3", user_id: "u_emp_solano", kind: "application_received", title: "New application", body: "Jordan Lee applied to “After-school dog walker”.", link: "/dashboard/employer/applications/app_jordan_dog", read_at: null, created_at: iso(-1) },
    { id: "n4", user_id: "u_emp_solano", kind: "verification_update", title: "Verification approved", body: "Your business profile was reviewed by a TaskTeens administrator. This is a profile review, not a background check.", link: "/dashboard/employer/settings", read_at: iso(-20), created_at: iso(-21) },
  ];

  const verification_requests: VerificationRequest[] = [
    { id: "ver_nguyen", employer_id: "u_emp_nguyen", employer_type: "individual", submitted_info: { legal_name: "Linh Nguyen", notes: "Parent of two BUSD students. Happy to do a video call." }, status: "pending", reviewer_id: null, review_note: null, created_at: iso(-5), reviewed_at: null },
    { id: "ver_elmwood", employer_id: "u_emp_elmwood", employer_type: "business", submitted_info: { legal_name: "Elmwood Learning Collective", business_registration: "Berkeley business license (pending lookup)", website: null }, status: "pending", reviewer_id: null, review_note: null, created_at: iso(-3), reviewed_at: null },
    { id: "ver_solano", employer_id: "u_emp_solano", employer_type: "business", submitted_info: { legal_name: "Solano Paws LLC", business_registration: "Albany business license", website: "https://example.com/solano-paws" }, status: "approved", reviewer_id: "u_admin", review_note: "Business license and website reviewed.", created_at: iso(-25), reviewed_at: iso(-21) },
  ];

  const reports: Report[] = [
    { id: "rep_1", reporter_id: "u_teen_jordan", target_type: "job", target_id: "job_garden_watering", reason: "Pay not received / pay dispute", details: "Demo report: the flat pay seems low for daily visits over two weeks — can someone check the listing?", severity: "normal", contact_email: null, status: "open", resolution_note: null, created_at: iso(-2), updated_at: iso(-2) },
  ];

  const admin_audit_logs: AdminAuditLog[] = [
    { id: "log_1", admin_id: "u_admin", action: "verification.approve", target_type: "employer", target_id: "u_emp_solano", note: "Business license and website reviewed.", metadata: {}, created_at: iso(-21) },
    { id: "log_2", admin_id: "u_admin", action: "job.approve", target_type: "job", target_id: "job_dog_walker_solano", note: null, metadata: {}, created_at: iso(-2) },
  ];

  return {
    version: DEMO_DB_VERSION,
    users,
    teen_profiles,
    employer_profiles,
    jobs,
    applications,
    application_notes: [
      { id: "note_1", application_id: "app_aisha_petsit", employer_id: "u_emp_solano", body: "Seems great — confirm she's comfortable with the 16+ age requirement for solo visits.", created_at: iso(-2) },
    ],
    saved_jobs: [
      { user_id: "u_teen_maya", job_id: "job_dog_walker_solano", created_at: iso(-2) },
      { user_id: "u_teen_maya", job_id: "job_social_media", created_at: iso(-3) },
    ],
    notifications,
    interview_requests,
    reports,
    verification_requests,
    admin_audit_logs,
    blocks: [],
    employer_reviews,
    teen_feedback,
    categories: CATEGORIES.map((c) => ({ ...c })),
    service_areas: SERVICE_AREAS.map((a) => ({ ...a })),
    settings: { ...DEFAULT_SETTINGS },
    outbox: [],
  };
}
