import { ClassItem, FileItem, SubjectCategory, QuizItem, HomeworkItem, LessonItem } from '../types';

export const INITIAL_CLASSES: ClassItem[] = [
  {
    id: 'grade-9',
    name: 'Grade 9',
    section: 'Batch 2026',
    description: 'General Mathematics, Science, English, and Social Studies materials.',
    color: 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400',
    icon: 'GraduationCap',
    password: '1234'
  },
  {
    id: 'grade-10',
    name: 'Grade 10',
    section: 'Board Prep',
    description: 'Physics, Chemistry, Advanced Algebra, and Secondary Literature.',
    color: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:border-blue-800 dark:text-blue-400',
    icon: 'BookOpen',
    password: '1234'
  },
  {
    id: 'grade-11',
    name: 'Grade 11',
    section: 'Science & Tech',
    description: 'Computer Science, Higher Mathematics, Bio-Chemistry, and Research.',
    color: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:border-purple-800 dark:text-purple-400',
    icon: 'Cpu',
    password: '1234'
  },
  {
    id: 'grade-12',
    name: 'Grade 12',
    section: 'Senior Academy',
    description: 'College Prep Calculus, Organic Chemistry, World History, and Final Projects.',
    color: 'bg-amber-500/10 text-amber-700 border-amber-200 dark:border-amber-800 dark:text-amber-400',
    icon: 'Award',
    password: '1234'
  }
];

export const SUBJECT_CATEGORIES: SubjectCategory[] = [
  { id: 'all', name: 'All Subjects', color: 'bg-slate-100 text-slate-700' },
  { id: 'Mathematics', name: 'Mathematics', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'Science', name: 'Science / Physics', color: 'bg-teal-100 text-teal-700' },
  { id: 'Chemistry', name: 'Chemistry & Biology', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'Computer Science', name: 'Computer Science', color: 'bg-violet-100 text-violet-700' },
  { id: 'English & Literature', name: 'English & Literature', color: 'bg-rose-100 text-rose-700' },
  { id: 'Announcements', name: 'Announcements / Notices', color: 'bg-amber-100 text-amber-800' },
  { id: 'Exam Papers', name: 'Exam & Practice Papers', color: 'bg-sky-100 text-sky-800' },
];

export const INITIAL_QUIZZES: QuizItem[] = [
  {
    id: 'quiz-science-101',
    title: 'Comprehensive Science & Physics Mid-Term Assessment',
    description: 'Assessment covering plant physiology, laws of motion, cellular biology, and scientific reasoning with instant AI evaluation.',
    classId: 'grade-10',
    subject: 'Science',
    timeLimitMinutes: 25,
    totalPoints: 30,
    isPublished: true,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    createdBy: 'Dr. Robert Harrison',
    questions: [
      {
        id: 'q-sc-1',
        type: 'mcq',
        questionText: 'According to Newton\'s Second Law of Motion, what is the mathematical relationship between Force (F), Mass (m), and Acceleration (a)?',
        points: 5,
        options: [
          'A) F = m / a',
          'B) F = m * a',
          'C) F = m + a',
          'D) F = a / m'
        ],
        correctAnswer: 'B) F = m * a',
        gradingRubric: 'Full credit for option B. Explains that Net Force is equal to mass multiplied by acceleration.',
        orderIndex: 0
      },
      {
        id: 'q-sc-2',
        type: 'true_false',
        questionText: 'Sound waves can travel freely through a complete vacuum in outer space.',
        points: 5,
        options: ['True', 'False'],
        correctAnswer: 'False',
        gradingRubric: 'Full marks for False. Sound is a mechanical longitudinal wave that requires a material medium (solid, liquid, or gas) to propagate.',
        orderIndex: 1
      },
      {
        id: 'q-sc-3',
        type: 'fill_blanks',
        questionText: 'The biological organelle responsible for producing cellular energy in the form of ATP is called the [blank].',
        blankTemplate: 'The biological organelle responsible for producing cellular energy in the form of ATP is called the _______.',
        points: 5,
        correctAnswer: 'mitochondria (or mitochondrion)',
        gradingRubric: 'Accept "mitochondria", "mitochondrion", or "powerhouse / mitochondria".',
        orderIndex: 2
      },
      {
        id: 'q-sc-4',
        type: 'match_following',
        questionText: 'Match each scientific unit with its corresponding physical quantity:',
        points: 5,
        matchingPairs: [
          { id: 'm1', left: 'Force', right: 'Newton (N)' },
          { id: 'm2', left: 'Electric Current', right: 'Ampere (A)' },
          { id: 'm3', left: 'Frequency', right: 'Hertz (Hz)' },
          { id: 'm4', left: 'Electrical Resistance', right: 'Ohm (Ω)' }
        ],
        correctAnswer: 'Force: Newton (N), Electric Current: Ampere (A), Frequency: Hertz (Hz), Electrical Resistance: Ohm (Ω)',
        gradingRubric: 'Award proportional points (1.25 pts per correct pair matching).',
        orderIndex: 3
      },
      {
        id: 'q-sc-5',
        type: 'picture_question',
        questionText: 'Look at the provided diagram of plant photosynthesis. Explain the two main raw materials taken in by green leaves and the two essential products generated.',
        imageUrl: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=800&q=80',
        points: 5,
        correctAnswer: 'Raw materials: Carbon dioxide (CO2 from air) and Water (H2O from soil). Products: Glucose/Sugar (chemical energy for the plant) and Oxygen (O2 released into the atmosphere).',
        gradingRubric: 'Award 2.5 marks for identifying carbon dioxide and water, and 2.5 marks for identifying glucose/sugars and oxygen gas.',
        orderIndex: 4
      },
      {
        id: 'q-sc-6',
        type: 'question_answer',
        questionText: 'Explain the difference between Potential Energy and Kinetic Energy, giving one real-life example of each.',
        points: 5,
        correctAnswer: 'Potential energy is stored energy due to an object\'s position or state (e.g. water held behind a dam, a stretched rubber band). Kinetic energy is energy in motion (e.g. a rolling bowling ball, running water flowing downhill).',
        gradingRubric: 'Evaluate conceptual understanding of stored vs motion energy (3 pts) and clarity of real-world examples (2 pts).',
        orderIndex: 5
      }
    ]
  },
  {
    id: 'quiz-cs-102',
    title: 'Computer Science Fundamentals & Internet Architecture',
    description: 'Test your understanding of networking, hardware components, algorithmic logic, and web protocols.',
    classId: 'grade-11',
    subject: 'Computer Science',
    timeLimitMinutes: 20,
    totalPoints: 30,
    isPublished: true,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    createdBy: 'Mr. Alex Vance',
    questions: [
      {
        id: 'q-cs-1',
        type: 'mcq',
        questionText: 'Which computer component is responsible for executing program instructions and performing calculations?',
        points: 5,
        options: [
          'A) GPU (Graphics Card)',
          'B) CPU (Central Processing Unit)',
          'C) SSD Storage',
          'D) Power Supply Unit'
        ],
        correctAnswer: 'B) CPU (Central Processing Unit)',
        gradingRubric: 'Full credit for CPU.',
        orderIndex: 0
      },
      {
        id: 'q-cs-2',
        type: 'true_false',
        questionText: 'RAM (Random Access Memory) is non-volatile and permanently stores all files even when the computer is turned off.',
        points: 5,
        options: ['True', 'False'],
        correctAnswer: 'False',
        gradingRubric: 'RAM is volatile memory; data is lost when power is lost. Hard drives / SSDs are non-volatile.',
        orderIndex: 1
      },
      {
        id: 'q-cs-3',
        type: 'fill_blanks',
        questionText: 'The protocol used to securely transmit encrypted web pages between a browser and a web server is [blank].',
        blankTemplate: 'The protocol used to securely transmit encrypted web pages between a browser and a web server is _______.',
        points: 5,
        correctAnswer: 'HTTPS (or Hypertext Transfer Protocol Secure)',
        gradingRubric: 'Accept "HTTPS", "https", or "Hypertext Transfer Protocol Secure".',
        orderIndex: 2
      },
      {
        id: 'q-cs-4',
        type: 'match_following',
        questionText: 'Match each computer science term with its correct definition:',
        points: 5,
        matchingPairs: [
          { id: 'cs-m1', left: 'Algorithm', right: 'Step-by-step set of instructions to solve a problem' },
          { id: 'cs-m2', left: 'Compiler', right: 'Translates source code into machine code' },
          { id: 'cs-m3', left: 'Database', right: 'Organized collection of structured data' },
          { id: 'cs-m4', left: 'Firewall', right: 'Security system monitoring incoming network traffic' }
        ],
        correctAnswer: 'Algorithm: Step-by-step instructions; Compiler: Translates source to machine code; Database: Structured data; Firewall: Network security',
        gradingRubric: 'Full credit for all 4 correct matches.',
        orderIndex: 3
      },
      {
        id: 'q-cs-5',
        type: 'picture_question',
        questionText: 'Look at the computer motherboard layout diagram. Identify what the large central socket is used for and why heat sinks/fans are mounted over it.',
        imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
        points: 5,
        correctAnswer: 'The central socket houses the CPU (processor). Heat sinks and cooling fans are mounted on top because high computational activity generates intense thermal energy that must be dissipated to prevent overheating and thermal throttling.',
        gradingRubric: 'Award 2.5 marks for CPU socket identification and 2.5 marks for cooling / heat dissipation explanation.',
        orderIndex: 4
      },
      {
        id: 'q-cs-6',
        type: 'question_answer',
        questionText: 'Explain the difference between a Compiler and an Interpreter with respect to execution speed and error detection.',
        points: 5,
        correctAnswer: 'A compiler translates the entire source code into machine code before execution (faster runtime execution, errors reported all at once prior to running). An interpreter translates code line-by-line on the fly during execution (slower runtime, stops immediately when an error is encountered on a line).',
        gradingRubric: 'Grade on contrast in translation mechanism (all at once vs line-by-line), execution speed, and error reporting behavior.',
        orderIndex: 5
      }
    ]
  },
  {
    id: 'quiz-math-103',
    title: 'Grade 9 Mathematics - Algebra & Geometry Assessment',
    description: 'Quadratic expressions, linear slopes, geometric theorems, and angle relationships.',
    classId: 'grade-9',
    subject: 'Mathematics',
    timeLimitMinutes: 30,
    totalPoints: 30,
    isPublished: true,
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    createdBy: 'Mrs. Clara Bennett',
    questions: [
      {
        id: 'q-m-1',
        type: 'mcq',
        questionText: 'What are the roots (solutions) for the quadratic equation: x² - 5x + 6 = 0?',
        points: 5,
        options: [
          'A) x = 1 and x = 6',
          'B) x = 2 and x = 3',
          'C) x = -2 and x = -3',
          'D) x = -1 and x = 6'
        ],
        correctAnswer: 'B) x = 2 and x = 3',
        gradingRubric: 'Factoring gives (x-2)(x-3)=0 => x=2, 3.',
        orderIndex: 0
      },
      {
        id: 'q-m-2',
        type: 'true_false',
        questionText: 'The sum of all three interior angles in any Euclidean triangle is always exactly 180 degrees.',
        points: 5,
        options: ['True', 'False'],
        correctAnswer: 'True',
        gradingRubric: 'Full marks for True.',
        orderIndex: 1
      },
      {
        id: 'q-m-3',
        type: 'fill_blanks',
        questionText: 'In the slope-intercept form equation y = mx + b, the letter "m" represents the [blank] of the line.',
        blankTemplate: 'In the slope-intercept form equation y = mx + b, the letter "m" represents the _______ of the line.',
        points: 5,
        correctAnswer: 'slope (or gradient)',
        gradingRubric: 'Accept "slope", "gradient", or "rate of change".',
        orderIndex: 2
      },
      {
        id: 'q-m-4',
        type: 'match_following',
        questionText: 'Match each geometric shape with its perimeter/circumference formula:',
        points: 5,
        matchingPairs: [
          { id: 'gm1', left: 'Circle', right: '2 * π * r' },
          { id: 'gm2', left: 'Square', right: '4 * s' },
          { id: 'gm3', left: 'Rectangle', right: '2 * (l + w)' },
          { id: 'gm4', left: 'Equilateral Triangle', right: '3 * a' }
        ],
        correctAnswer: 'Circle: 2*pi*r, Square: 4*s, Rectangle: 2*(l+w), Triangle: 3*a',
        gradingRubric: '1.25 points per correct pair.',
        orderIndex: 3
      },
      {
        id: 'q-m-5',
        type: 'picture_question',
        questionText: 'Look at the right-angled triangle diagram. If side a = 6 cm and side b = 8 cm, calculate the hypotenuse length (c) using the Pythagorean theorem.',
        imageUrl: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80',
        points: 5,
        correctAnswer: 'c = 10 cm. Calculation: a² + b² = c² => 6² + 8² = 36 + 64 = 100 => c = √100 = 10 cm.',
        gradingRubric: 'Full marks for stating 10 cm with the formula a² + b² = c² step.',
        orderIndex: 4
      },
      {
        id: 'q-m-6',
        type: 'question_answer',
        questionText: 'State the difference between Rational numbers and Irrational numbers, giving two examples of each.',
        points: 5,
        correctAnswer: 'Rational numbers can be written as a fraction a/b where a, b are integers and b ≠ 0 (e.g. 1/2, 5, -3, 0.75). Irrational numbers cannot be expressed as a simple fraction; their decimal expansions are non-terminating and non-repeating (e.g. π, √2, √3).',
        gradingRubric: '2.5 marks for clear definition of ratio/fraction capability and 2.5 marks for correct examples.',
        orderIndex: 5
      }
    ]
  }
];

export const INITIAL_FILES: FileItem[] = [
  {
    id: 'file-101',
    title: 'Grade 10 Mid-Term Physics Study Guide & Formula Sheet',
    description: 'Includes Newton Laws of Motion, Optics formulas, Electricity circuits, and practice numerical problems with worked solutions.',
    classId: 'grade-10',
    subject: 'Science',
    fileType: 'pdf',
    fileName: 'Grade10_Physics_Midterm_Study_Guide.pdf',
    fileSize: 1048576, // 1.0 MB
    uploadDate: new Date(Date.now() - 86400000 * 1).toISOString(), // 1 day ago
    uploaderName: 'Dr. Robert Harrison',
    isPinned: true,
    downloadsCount: 42,
    fileDataUrl: `# Grade 10 Physics Mid-Term Study Guide & Formula Sheet
Prof. Harrison - Department of Physics

---

## Key Topics Covered
1. **Newton's Laws of Motion**
   - First Law: Law of Inertia
   - Second Law: F = m * a
   - Third Law: Equal and Opposite Action-Reaction

2. **Optics & Wave Motion**
   - Snell's Law: n1 * sin(θ1) = n2 * sin(θ2)
   - Lens Formula: 1/f = 1/v - 1/u
   - Magnification: m = h' / h = v / u

3. **Electric Currents & Magnetism**
   - Ohm's Law: V = I * R
   - Electrical Power: P = I^2 * R = V^2 / R
   - Equivalent Resistance in Series: R_eq = R1 + R2 + R3
   - Equivalent Resistance in Parallel: 1/R_eq = 1/R1 + 1/R2 + 1/R3

---

### Practice Numerical Problems
**Problem 1**: A car of mass 1200 kg accelerates from rest to 20 m/s in 5 seconds. Calculate the net force acting on the car.
*Solution*: Acceleration a = (v - u)/t = (20 - 0)/5 = 4 m/s^2.
Force F = m * a = 1200 * 4 = 4800 N.

**Problem 2**: An object is placed 15 cm in front of a concave mirror of focal length 10 cm. Find the image distance and nature of image.
*Solution*: Using 1/f = 1/v + 1/u => 1/(-10) = 1/v + 1/(-15) => 1/v = 1/15 - 1/10 = -1/30 => v = -30 cm (Real, inverted, magnified image).`
  },
  {
    id: 'file-102',
    title: 'IMPORTANT: First Semester Exam Schedule & Room Allocation',
    description: 'Official schedule for all subject examinations starting next Monday. Please review room assignments carefully before the test day.',
    classId: 'all',
    subject: 'Announcements',
    fileType: 'note',
    fileName: 'First_Semester_Exam_Schedule.txt',
    fileSize: 45056,
    uploadDate: new Date(Date.now() - 86400000 * 2).toISOString(),
    uploaderName: 'Principal Office',
    isPinned: true,
    downloadsCount: 128,
    fileDataUrl: `SCHOOL BULLETIN BOARD - OFFICIAL NOTICE

Subject: First Semester Examination Schedule & Room Allocations
Date: August 2026

Dear Students and Teachers,

The First Semester Examinations will take place according to the following schedule:

- Monday 9:00 AM - 11:30 AM: Mathematics (Main Auditorium & Rooms 101-104)
- Tuesday 9:00 AM - 11:30 AM: Physics & Chemistry (Science Wing Labs)
- Wednesday 9:00 AM - 11:30 AM: Computer Science & Literature (Computer Lab & Rooms 201-203)
- Thursday 9:00 AM - 11:30 AM: Social Studies & Foreign Languages (Rooms 301-305)

RULES FOR THE EXAM HALL:
1. Student IDs must be visible on desks at all times.
2. Scientific calculators are permitted ONLY for Physics and Chemistry exams.
3. No mobile phones or electronic devices are permitted inside the examination room.

Good luck with your preparation!`
  },
  {
    id: 'file-103',
    title: 'Grade 9 Mathematics - Algebra Practice Worksheet #4',
    description: 'Quadratic equations, factoring polynomials, and graphing parabolas. Complete all 15 questions for submission next Friday.',
    classId: 'grade-9',
    subject: 'Mathematics',
    fileType: 'pdf',
    fileName: 'Grade9_Algebra_Worksheet4.pdf',
    fileSize: 524288,
    uploadDate: new Date(Date.now() - 86400000 * 3).toISOString(),
    uploaderName: 'Mrs. Clara Bennett',
    isPinned: false,
    downloadsCount: 35,
    fileDataUrl: `# Grade 9 Algebra Practice Worksheet #4
Teacher: Mrs. Clara Bennett

Solve the following quadratic equations and factored expressions:

1. Factoring Quadratics:
   a) x^2 + 7x + 12 = 0
   b) x^2 - 9x + 20 = 0
   c) 2x^2 + 5x - 3 = 0

2. Solve using Quadratic Formula: x = [-b ± √(b² - 4ac)] / (2a)
   a) x^2 - 4x - 5 = 0
   b) 3x^2 + 2x - 8 = 0

3. Graphing Parabolas:
   For the equation y = x^2 - 4x + 3:
   a) Find the vertex coordinates (h, k).
   b) Find the y-intercept.
   c) Find the x-intercepts.
   d) Draw the sketch in your notebook.`
  },
  {
    id: 'file-104',
    title: 'Grade 11 Computer Science - Python Data Structures Cheatsheet',
    description: 'Quick reference guide covering Lists, Dictionaries, Sets, Tuples, List Comprehensions, and algorithmic complexity (Big O).',
    classId: 'grade-11',
    subject: 'Computer Science',
    fileType: 'doc',
    fileName: 'Python_Data_Structures_Cheatsheet.docx',
    fileSize: 786432,
    uploadDate: new Date(Date.now() - 86400000 * 4).toISOString(),
    uploaderName: 'Mr. Alex Vance',
    isPinned: false,
    downloadsCount: 64,
    fileDataUrl: `# Python Data Structures Cheatsheet - Grade 11 CS
Instructor: Mr. Alex Vance

1. LISTS (Mutable, Ordered)
   my_list = [10, 20, 30]
   my_list.append(40)      # O(1)
   my_list.pop()           # O(1)
   my_list.sort()          # O(N log N)

2. DICTIONARIES (Key-Value, Mutable)
   student = {"name": "Alice", "grade": 11, "score": 95}
   student["subject"] = "CS"
   for key, value in student.items():
       print(key, "->", value)

3. SETS (Unique elements, Unordered)
   unique_ids = {101, 102, 103}
   unique_ids.add(104)

4. LIST COMPREHENSION
   squares = [x**2 for x in range(10) if x % 2 == 0]`
  },
  {
    id: 'file-105',
    title: 'Grade 12 Advanced Biology - Cell Respiration Interactive Diagram',
    description: 'High-resolution diagram illustrating Glycolysis, Krebs Cycle, and Electron Transport Chain steps in mitochondria.',
    classId: 'grade-12',
    subject: 'Chemistry',
    fileType: 'image',
    fileName: 'Mitochondria_Cellular_Respiration.png',
    fileSize: 1572864,
    uploadDate: new Date(Date.now() - 86400000 * 5).toISOString(),
    uploaderName: 'Dr. Sarah Lin',
    isPinned: false,
    downloadsCount: 51,
    externalUrl: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80',
    fileDataUrl: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'file-106',
    title: 'Video Lecture: Organic Chemistry Reactions & Mechanism Overview',
    description: 'Recorded 30-minute explanation of Nucleophilic Substitution (SN1/SN2) and Electrophilic Addition reactions.',
    classId: 'grade-12',
    subject: 'Chemistry',
    fileType: 'video',
    fileName: 'Organic_Chemistry_Lecture_Ch4.mp4',
    fileSize: 15728640,
    uploadDate: new Date(Date.now() - 86400000 * 6).toISOString(),
    uploaderName: 'Dr. Sarah Lin',
    isPinned: false,
    downloadsCount: 78,
    externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  },
  {
    id: 'file-107',
    title: 'Grade 10 English Literature - Shakespeare Essay Rubric & Examples',
    description: 'Grading scheme and formatting instructions for the Macbeth character study essay due end of month.',
    classId: 'grade-10',
    subject: 'English & Literature',
    fileType: 'pdf',
    fileName: 'Macbeth_Essay_Rubric_Grade10.pdf',
    fileSize: 314572,
    uploadDate: new Date(Date.now() - 86400000 * 7).toISOString(),
    uploaderName: 'Ms. Emily Davis',
    isPinned: false,
    downloadsCount: 39,
    fileDataUrl: `# Macbeth Essay Rubric & Structural Guidance
Teacher: Ms. Emily Davis

## Essay Prompt:
Analyze how Lady Macbeth's ambition evolves throughout Shakespeare's Macbeth, referencing at least three key soliloquies.

## Structure Requirements (1000 - 1200 Words)
1. **Introduction**:
   - Thesis statement introducing the duality of ambition and guilt.
2. **Body Paragraphs**:
   - Paragraph 1: Unsex me here (Act 1, Scene 5)
   - Paragraph 2: The illusion of control & murder of Duncan (Act 2)
   - Paragraph 3: Sleepwalking scene & breakdown of mind (Act 5, Scene 1)
3. **Conclusion**:
   - Summary of key arguments and broader theme of unchecked power.`
  }
];

const getTodayStr = () => new Date().toISOString().slice(0, 10);
const getTomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const getFutureDateStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const getPastDateStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export const INITIAL_HOMEWORK: HomeworkItem[] = [];

export const INITIAL_LESSONS: LessonItem[] = [];
