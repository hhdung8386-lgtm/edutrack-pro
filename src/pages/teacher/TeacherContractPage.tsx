import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { toast } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { FileText, Download, ShieldCheck, Clock, MapPin, Laptop } from 'lucide-react'

const TERMS_CONTENT = `123ENGLISH ONLINE TEACHING PLATFORM
TERMS AND CONDITIONS FOR TUTORS
Effective Date: July 09, 2026

These Terms and Conditions (“Terms”) govern the registration, access, and use of the 123English Online Teaching Platform by tutors, teachers, instructors, and other educational service providers (“Tutors”).

The 123English Online Teaching Platform (“123English” or the “Platform”) is operated and managed by:
GIA SU TOAN NANG BUSINESS ESTABLISHMENT
Tax Identification Number: 079196005873
Registered Office Address: 78/20 Hoang Van Hop Street, An Lac Ward, Ho Chi Minh City, Vietnam
Representative: Nguyen Thu Trang
Telephone: 090.696.6691 – 039.399.8733

By registering for a Tutor account, accessing the Platform, accepting a class, providing tutoring or teaching services, or otherwise using any services provided through the 123English Online Teaching Platform, the Tutor confirms that they have read, understood, accepted, and agreed to comply with these Terms and Conditions.

ARTICLE 1. PURPOSE AND SCOPE
1.1. The 123English Online Teaching Platform is an educational technology platform that connects students and parents/guardians with Tutors for online teaching and learning services.
1.2. Tutors may use the Platform to:
Receive class assignments;
Access student and class information;
Manage teaching schedules;
Provide one-on-one or small-group online lessons;
Submit attendance records;
Submit student learning reports and evaluations;
Communicate with students, parents/guardians, and 123English personnel;
Receive remuneration for completed teaching services; and
Use other functions and services provided through the Platform.
1.3. These Terms apply to all Tutors who register for an account, access the Platform, receive or accept classes, provide teaching services, or otherwise use the 123English Online Teaching Platform.

ARTICLE 2. TUTOR ACCOUNT REGISTRATION
2.1. To use the Platform as a Tutor, the Tutor may be required to create and maintain a Tutor account.
2.2. The Tutor must provide accurate, complete, and up-to-date information, including but not limited to:
Full name;
Date of birth;
Identification documents;
Contact information;
Educational qualifications;
Teaching experience;
Professional certificates;
Language certificates;
Banking or payment information; and
Other information reasonably required by 123English.
2.3. Tutors are responsible for ensuring that all information and documents submitted to 123English are truthful, accurate, complete, and valid.
2.4. 123English reserves the right to request additional documents or information for identity verification, qualification verification, quality control, legal compliance, fraud prevention, or Platform security purposes.
2.5. Tutors must not:
Create accounts using false or misleading information;
Submit false, forged, or fraudulent documents;
Impersonate another person;
Allow another person to access or use their Tutor account;
Create multiple accounts for fraudulent or unauthorized purposes; or
Use the Platform for any unlawful or unauthorized purpose.
2.6. Tutors are responsible for maintaining the confidentiality and security of their account information and login credentials.
2.7. Any activity conducted through a Tutor’s account may be considered activity performed by that Tutor unless sufficient evidence demonstrates unauthorized access.

ARTICLE 3. TUTOR ELIGIBILITY AND VERIFICATION
3.1. 123English may establish qualification and eligibility requirements for Tutors depending on the subject, course, student level, teaching method, or specific requirements of each class.
3.2. Tutors may be required to provide:
Identification documents;
Academic qualifications;
Teaching certificates;
Language certificates;
Professional certificates;
Teaching demonstration videos;
Interview results;
Background information; or
Other documents or information reasonably requested by 123English.
3.3. 123English reserves the right to verify any information and documents provided by Tutors.
3.4. Providing false, misleading, forged, fraudulent, expired, or invalid documents may result in rejection of the Tutor’s application, temporary account suspension, permanent account termination, or other appropriate actions.
3.5. Approval of a Tutor account does not guarantee that the Tutor will receive any minimum number of students, classes, teaching hours, assignments, or income.

ARTICLE 4. CLASS ASSIGNMENTS
4.1. 123English may introduce, recommend, or assign classes to Tutors based on factors including, but not limited to:
Tutor qualifications;
Teaching experience;
Subject expertise;
Availability;
Student requirements;
Teaching performance;
Tutor ratings;
Platform activity;
Class requirements; and
Other relevant criteria determined by 123English.
4.2. Tutors may be provided with relevant information regarding a class before accepting the assignment.
4.3. The remuneration rate for each class or teaching assignment shall be communicated or agreed upon before the Tutor accepts the class.
4.4. By accepting a class, the Tutor agrees to:
Follow the confirmed teaching schedule;
Provide the required teaching services;
Comply with student learning requirements;
Comply with these Terms and other applicable Platform policies; and
Complete all related teaching, attendance, evaluation, and reporting responsibilities.
4.5. Tutors must not transfer an assigned class or allow another person to teach the class without prior written approval from 123English.
4.6. 123English does not guarantee any minimum number of class assignments, students, teaching hours, or income to Tutors.

ARTICLE 5. TEACHING RESPONSIBILITIES
5.1. Tutors must provide teaching services responsibly, professionally, and in accordance with the learning needs, proficiency levels, and learning objectives of students.
5.2. Tutors are responsible for preparing:
Lesson plans;
Teaching content;
Learning materials;
Exercises;
Student evaluations; and
Other necessary teaching materials.
5.3. Tutors must attend lessons at the agreed time and provide teaching services for the full scheduled duration.
5.4. Tutors must maintain professional conduct, appropriate attire, proper teaching ethics, and respectful behavior toward:
Students;
Parents and guardians;
Other Tutors;
123English personnel; and
Other Platform users.
5.5. Tutors must not engage in:
Harassment;
Discrimination;
Threatening behavior;
Abusive conduct;
Inappropriate communication;
Sexual misconduct;
Violence;
Bullying; or
Any behavior that may endanger students or other Platform users or damage the reputation and lawful interests of 123English.
5.6. 123English reserves the right to monitor, review, and evaluate teaching quality and Tutor performance.

ARTICLE 6. ONLINE TEACHING REQUIREMENTS
6.1. Tutors providing online lessons are responsible for maintaining appropriate:
Computers or teaching devices;
Stable internet connections;
Cameras;
Microphones;
Audio quality;
Video quality; and
Professional teaching environments.
6.2. Tutors must keep their cameras turned on during online lessons unless otherwise approved by 123English or prevented by circumstances beyond their reasonable control.
6.3. Tutors must teach from an appropriate, quiet, safe, and professional environment.
6.4. Tutors must not conduct lessons while:
Driving;
Traveling in unsafe conditions;
Participating in unrelated activities;
Using inappropriate locations; or
Being in an environment that significantly affects teaching quality.
6.5. Tutors are responsible for ensuring that their equipment and internet connections are properly tested before each lesson.

ARTICLE 7. ATTENDANCE, CANCELLATION, AND SCHEDULE CHANGES
7.1. Tutors must attend classes according to the confirmed teaching schedule.
7.2. If a Tutor needs to cancel or reschedule a lesson, the Tutor must notify 123English and the student at least two (02) hours in advance.
7.3. If the Tutor provides late notice without a reasonable or force majeure reason, 123English may require the Tutor to provide one (01) replacement lesson without additional remuneration.
7.4. Repeated lateness, cancellations, absences, or failure to attend classes may result in:
Warnings;
Reduced class assignments;
Removal from assigned classes;
Temporary account restrictions;
Temporary account suspension; or
Permanent termination of the Tutor account.
7.5. If a Tutor wishes to stop teaching one or more assigned classes while continuing to use the Platform, the Tutor must provide 123English with at least fourteen (14) days’ prior written notice.
7.6. If a Tutor wishes to stop using the Platform and terminate their collaboration with 123English, the Tutor must provide at least forty-five (45) days’ prior written notice and complete all required class handovers, student reports, documents, and related responsibilities.

ARTICLE 8. STUDENT MANAGEMENT AND LEARNING REPORTS
8.1. Tutors are responsible for monitoring student learning progress.
8.2. Tutors may be required to submit:
Attendance records;
Learning reports;
Student evaluations;
Progress assessments;
Homework records;
Teaching notes; and
Other educational information reasonably requested by 123English.
8.3. Tutors must ensure that all reports, records, and information submitted through the Platform are truthful, accurate, complete, and up to date.
8.4. Fraudulent or dishonest reporting of teaching hours, attendance, student performance, learning results, class activities, or other Platform information is strictly prohibited.

ARTICLE 9. REMUNERATION AND PAYMENT
9.1. Tutor remuneration may be calculated based on:
Completed classes;
Actual teaching hours;
Specific class assignments;
Courses;
Projects; or
Other remuneration methods communicated by 123English.
9.2. The applicable remuneration rate shall be communicated to the Tutor before the Tutor accepts the relevant class or assignment.
9.3. 123English shall generally process Tutor payments on the 10th day of each month unless another payment schedule has been agreed upon or announced.
9.4. If the payment date falls on a public holiday, Tet holiday, or statutory non-working day, payment may be processed on the next working day.
9.5. Tutors are responsible for providing accurate and valid payment information.
9.6. Applicable taxes, including personal income tax withholding, may be deducted in accordance with applicable laws.
9.7. 123English may review, investigate, temporarily suspend, or withhold disputed payments where there is reasonable evidence of fraud, incorrect teaching records, false attendance information, violation of these Terms, outstanding financial obligations, or other payment-related disputes.
9.8. If a student has paid for a course or package of lessons but has not completed all lessons included in that course or package, and the student advances or is transferred to a higher level before completing the remaining lessons, the Tutor’s remuneration for all remaining lessons shall continue to be calculated at the remuneration rate originally applicable to the course or package purchased by the student.
9.9. The Tutor acknowledges and agrees that any advancement in the student’s level, change in teaching content, increase in course difficulty, or transition to a higher-level curriculum shall not automatically result in an adjustment or increase in the Tutor’s remuneration for lessons already purchased or paid for by the student under the previous course or package.
9.10. The remuneration rate applicable to the student’s new or higher level, if any, shall only apply after the student has completed all remaining lessons under the previous course or package and purchases, renews, or begins a new course or package at the new or higher level.
9.11. By accepting and continuing to teach an assigned class through the Platform, the Tutor acknowledges and agrees to the remuneration calculation method set out in this Article.

ARTICLE 10. STUDENT ABSENCE
10.1. Tutors must attend confirmed classes on time.
10.2. If a student fails to attend a confirmed lesson without providing the required notice, but the Tutor attends on time and remains available for the full required lesson duration, the Tutor may remain eligible for remuneration in accordance with the applicable 123English cancellation and payment policy.

ARTICLE 11. COMMUNICATION WITH STUDENTS AND PARENTS
11.1. Tutors may communicate with students and parents/guardians only for legitimate educational and class-related purposes and through communication channels approved or authorized by 123English.
11.2. Tutors must maintain professional, respectful, and appropriate communication at all times.
11.3. Tutors must not use student or parent/guardian information for unauthorized commercial, personal, private, or other purposes unrelated to authorized teaching activities.
11.4. Tutors must not request, encourage, persuade, or induce students or parents/guardians to leave the 123English Online Teaching Platform for the purpose of entering into private teaching, commercial, or other unauthorized arrangements.
11.5. Tutors must not directly or indirectly request, ask for, collect, exchange, search for, attempt to obtain, or otherwise acquire the personal contact information or social media information of students or parents/guardians outside the 123English Online Teaching Platform unless expressly authorized in writing by 123English.
11.6. Prohibited personal contact information and social media information include, but are not limited to:
Personal telephone numbers;
Personal email addresses;
Facebook accounts;
Messenger accounts;
Zalo accounts;
Instagram accounts;
TikTok accounts;
WhatsApp accounts;
Telegram accounts;
WeChat accounts;
LINE accounts;
Other social media accounts;
Personal messaging accounts; and
Any other information that may enable the Tutor to contact a student or parent/guardian outside the 123English Online Teaching Platform or communication channels officially authorized by 123English.
11.7. Tutors must not ask students or parents/guardians to add, follow, connect with, message, or communicate with the Tutor through any personal social media account, messaging application, telephone number, email address, or other communication channel outside the 123English Online Teaching Platform.
11.8. Tutors must not provide, offer, display, send, or otherwise disclose their own personal contact information or social media information to students or parents/guardians or encourage students or parents/guardians to search for or contact them outside the Platform.
11.9. If a student or parent/guardian voluntarily provides personal contact information or social media information to a Tutor, the Tutor must not use such information for unauthorized communication, private tutoring, commercial purposes, solicitation, circumvention of the Platform, or any other purpose not approved by 123English.
11.10. Any attempt to request, collect, exchange, provide, search for, obtain, or otherwise acquire personal contact information or social media information for the purpose of establishing communication with a student or parent/guardian outside the Platform may be considered a serious violation of these Terms, regardless of whether the Tutor successfully obtains such information, establishes contact, provides private tutoring services, collects any payment, or receives any financial or other benefit.

ARTICLE 12. PLATFORM NON-CIRCUMVENTION POLICY
12.1. Students and parents/guardians introduced, managed, assigned, or connected through the 123English Online Teaching Platform are considered Platform connections.
12.2. Tutors must not directly or indirectly:
Provide unauthorized private tutoring to Platform students;
Collect tuition fees or other payments directly from Platform students or parents/guardians;
Enter into private teaching agreements with Platform students;
Transfer Platform students to another individual, platform, business, or organization;
Refer Platform students to third-party teaching services;
Encourage students or parents/guardians to discontinue using 123English;
Use student information to develop, operate, or support competing services;
Contact students or parents/guardians for unauthorized commercial purposes; or
Otherwise circumvent or attempt to circumvent the Platform.
12.3. These restrictions apply during the Tutor’s use of the Platform and for six (06) months after the Tutor stops using the Platform.
12.4. Exceptions may be permitted only with prior written approval from 123English.

ARTICLE 13. CONFIDENTIALITY
13.1. Tutors must maintain the confidentiality of information relating to:
Students;
Parents and guardians;
Tutors;
Employees;
Personnel;
Partners;
Customers;
Business operations;
Platform data;
Teaching materials;
Internal procedures;
Technology;
Marketing activities; and
Other confidential or proprietary information belonging to or managed by 123English.
13.2. Tutors must not copy, disclose, publish, distribute, sell, transfer, or unlawfully use confidential information.
13.3. Tutors may use confidential information only to the extent reasonably necessary to provide authorized teaching services through the Platform.
13.4. Confidentiality obligations shall continue after the Tutor stops using the Platform or terminates their collaboration with 123English.

ARTICLE 14. INTELLECTUAL PROPERTY
14.1. All intellectual property owned, developed, licensed, or lawfully used by 123English remains the property of 123English or the relevant rights holder.
14.2. Intellectual property may include, but is not limited to:
Logos;
Trade names;
Trademarks;
Brand identities;
Website content;
Platform interfaces;
Software;
Source code;
Databases;
Teaching materials;
Training materials;
Examinations;
Educational content;
Images;
Videos;
Documents;
Business methods; and
Internal procedures.
14.3. Tutors must not copy, reproduce, modify, distribute, publish, sell, transfer, license, commercially exploit, or unlawfully use 123English intellectual property without prior written permission.

ARTICLE 15. USE OF TUTOR INFORMATION AND CONTENT
15.1. Tutors authorize 123English to collect, store, process, and use information reasonably necessary to:
Operate the Platform;
Verify Tutor identities and qualifications;
Manage classes;
Connect Tutors with students;
Process payments;
Provide customer support;
Improve Platform services;
Maintain Platform security;
Prevent fraud;
Resolve disputes; and
Comply with applicable legal requirements.
15.2. Subject to applicable laws and required consent, 123English may use Tutor information and content, including:
Name;
Professional profile;
Qualifications;
Teaching experience;
Profile photographs;
Voice;
Teaching videos;
Recorded lessons;
Student feedback;
Teaching performance information; and
Other professional information
for Platform operations, Tutor introduction, marketing, communication, recruitment, quality control, internal training, and other lawful business purposes.

ARTICLE 16. PLATFORM MONITORING AND QUALITY CONTROL
16.1. 123English may monitor Platform activities for:
Quality control;
Student safety;
Fraud prevention;
Dispute resolution;
Technical support;
Training;
Platform security; and
Compliance with these Terms.
16.2. Subject to applicable laws, online lessons, communications, teaching activities, and Platform interactions may be recorded, stored, monitored, or reviewed.
16.3. Tutors agree to reasonably cooperate with quality control reviews, investigations, and compliance procedures conducted by 123English.

ARTICLE 17. PROHIBITED ACTIVITIES
Tutors must not:
Provide false or misleading information;
Submit forged or fraudulent documents;
Commit payment fraud;
Manipulate attendance records;
Manipulate teaching records;
Access another user’s account;
Share Tutor accounts;
Interfere with Platform operations;
Attempt unauthorized access to Platform systems;
Collect, scrape, or extract Platform data without authorization;
Introduce viruses, malicious software, or harmful technology;
Harass students or other Platform users;
Violate student privacy;
Steal, disclose, or misuse Platform information;
Request, exchange, collect, search for, obtain, or provide personal contact information or social media information for unauthorized off-Platform communication;
Circumvent or attempt to circumvent the Platform;
Damage the reputation, business operations, or lawful interests of 123English;
Use the Platform to promote unauthorized competing services; or
Use the Platform for unlawful activities.

ARTICLE 18. VIOLATIONS AND ENFORCEMENT
18.1. If a Tutor violates these Terms, 123English may take appropriate action depending on the nature, circumstances, frequency, and severity of the violation.
18.2. Actions may include:
Warnings;
Requests for corrective action;
Temporary Platform restrictions;
Reduced class assignments;
Removal from assigned classes;
Temporary account suspension;
Permanent account termination;
Payment review;
Claims for damages; or
Other measures permitted by applicable laws.
18.3. Where applicable and legally enforceable, the following contractual penalties may apply:
a. Unauthorized abandonment of an assigned class without the required notice:
VND 1,000,000 per affected class.
b. Unauthorized disclosure of confidential information:
VND 5,000,000 per violation.
c. Unauthorized copying, possession, distribution, transfer, or use of 123English intellectual property, educational materials, student data, customer data, or internal procedures:
VND 5,000,000 per violation.
d. Unauthorized use of the 123English trade name, logo, brand identity, or other brand assets:
VND 5,000,000 per violation.
e. Violations of teaching standards, camera requirements, reporting obligations, unauthorized class transfers, or other professional requirements:
VND 500,000 per violation.
f. Unauthorized private tutoring, direct collection of tuition fees, referral to third parties, or private collaboration with Platform students or parents/guardians:
VND 10,000,000 per affected student.
g. Soliciting or attempting to transfer 123English students, parents/guardians, or customers to another individual, platform, business, or organization:
VND 10,000,000 per affected student or customer.
h. Fraudulent reporting of teaching hours, attendance, learning outcomes, or other teaching-related information:
VND 5,000,000 per violation.
i. Requesting, asking for, collecting, exchanging, searching for, attempting to obtain, providing, or otherwise acquiring personal contact information, personal social media information, or other unauthorized communication information for the purpose of establishing contact between a Tutor and a student or parent/guardian outside the 123English Online Teaching Platform:
VND 5,000,000 per violation.
The penalty specified in Article 18.3(i) may apply regardless of whether the Tutor successfully obtains the information, establishes contact with the student or parent/guardian, provides private tutoring services, collects tuition fees, receives payment, or obtains any other financial or non-financial benefit.
If such conduct is also related to unauthorized private tutoring, direct collection of tuition fees, solicitation of students, transfer of students to another individual or organization, or other attempts to circumvent the 123English Online Teaching Platform, 123English may apply other relevant penalties and enforcement measures under these Terms, subject to applicable laws.
18.4. The application of contractual penalties does not exclude the right of 123English to claim compensation for actual damages in accordance with applicable laws.
18.5. Multiple or repeated violations may be handled separately and cumulatively.
18.6. Documents, Platform records, messages, emails, lawfully obtained audio or video recordings, electronic data, payment records, system logs, and confirmations from relevant parties may be used as evidence when reviewing or investigating violations.

ARTICLE 19. ACCOUNT SUSPENSION AND TERMINATION
19.1. 123English may temporarily suspend, restrict, or permanently terminate a Tutor account if the Tutor:
Violates these Terms;
Provides fraudulent information;
Creates risks to students;
Commits serious professional misconduct;
Violates confidentiality obligations;
Circumvents the Platform;
Misuses Platform data;
Violates intellectual property rights;
Commits fraud; or
Engages in unlawful activities.
19.2. In serious cases, 123English may immediately suspend or terminate an account without prior notice where reasonably necessary to protect students, parents/guardians, Platform users, 123English, Platform systems and security, or the lawful rights and interests of relevant parties.
19.3. Termination or suspension of a Tutor account does not eliminate obligations relating to confidentiality, intellectual property, outstanding payments, financial obligations, damages, contractual penalties, dispute resolution, or other obligations that are intended to survive termination.

ARTICLE 20. INDEPENDENT TUTOR STATUS
20.1. Tutors use the 123English Online Teaching Platform as independent educational service providers unless otherwise agreed in a separate written agreement.
20.2. Nothing in these Terms shall automatically be interpreted as creating an employment relationship, partnership, joint venture, agency relationship, franchise relationship, or legal representation relationship between 123English and the Tutor.
20.3. Tutors are responsible for complying with applicable legal, professional, and tax obligations relating to their teaching activities.
20.4. Tutors independently determine whether to accept available class assignments, subject to their obligations after accepting a class.

ARTICLE 21. PLATFORM AVAILABILITY
21.1. 123English aims to maintain stable and reliable Platform operations but does not guarantee uninterrupted, continuous, secure, or error-free access.
21.2. Platform services may be temporarily unavailable due to:
Maintenance;
System updates;
Technical failures;
Internet failures;
Cybersecurity incidents;
Third-party service interruptions;
Force majeure events; or
Other circumstances beyond reasonable control.
21.3. 123English may modify, update, suspend, replace, restrict, or discontinue certain Platform functions when reasonably necessary.

ARTICLE 22. LIMITATION OF LIABILITY
22.1. To the extent permitted by applicable laws, 123English shall not be responsible for indirect, incidental, special, or consequential damages resulting from the Tutor’s use of or inability to use the Platform.
22.2. Tutors are responsible for their own teaching equipment, internet access, teaching environment, account security, professional conduct, teaching services, and compliance with these Terms.
22.3. 123English shall not be responsible for losses caused by inaccurate information, misconduct, negligence, fraud, or unauthorized activities of Tutors or other Platform users, except where liability is imposed on 123English by applicable laws.
22.4. Nothing in these Terms excludes or limits any liability that cannot legally be excluded or limited under applicable laws.

ARTICLE 23. AMENDMENTS TO THESE TERMS
23.1. 123English may update or amend these Terms from time to time to reflect:
Changes in Platform operations;
New Platform functions;
Changes in services;
Legal requirements;
Security requirements;
Business requirements; or
Changes in Platform policies.
23.2. Updated Terms may be published or communicated through:
The Platform;
The 123English website;
Applications;
Tutor accounts;
Email;
Electronic notifications; or
Other appropriate communication channels.
23.3. Tutors are responsible for reviewing updated Terms when notified.
23.4. Continued use of the 123English Online Teaching Platform after updated Terms become effective constitutes acceptance of the updated Terms, to the extent permitted by applicable laws.

ARTICLE 24. GOVERNING LAW AND DISPUTE RESOLUTION
24.1. These Terms shall be governed by and interpreted in accordance with the laws of the Socialist Republic of Vietnam.
24.2. Any dispute arising from or relating to these Terms or the use of the 123English Online Teaching Platform shall first be resolved through good-faith negotiation and mediation.
24.3. If the parties are unable to resolve the dispute through negotiation or mediation, the dispute may be submitted to a competent People’s Court in Ho Chi Minh City, Vietnam.

ARTICLE 25. EFFECTIVENESS AND ACCEPTANCE OF TERMS
25.1. These Terms and Conditions become effective from the date published, displayed on the Platform, or otherwise notified by 123English.
25.2. By performing any of the following actions:
Creating a Tutor account;
Registering to become a Tutor;
Selecting or clicking “I Agree”;
Accepting these Terms electronically;
Accessing a Tutor account;
Accepting a class;
Providing teaching services through the Platform; or
Continuing to access or use the 123English Online Teaching Platform,
the Tutor confirms that they have read, understood, accepted, and agreed to comply with these Terms and Conditions.
25.3. Electronic acceptance of these Terms shall constitute evidence of the Tutor’s agreement to these Terms to the extent permitted by applicable laws.
25.4. If the Tutor does not agree with these Terms and Conditions, the Tutor must not register for, access, or use the 123English Online Teaching Platform.

123ENGLISH ONLINE TEACHING PLATFORM
Operated and Managed by: GIA SU TOAN NANG BUSINESS ESTABLISHMENT
Tax Identification Number: 079196005873
Registered Office Address: 78/20 Hoang Van Hop Street, An Lac Ward, Ho Chi Minh City, Vietnam
Representative: Nguyen Thu Trang
Telephone: 090.696.6691 – 039.399.8733`;

export function TeacherContractPage() {
  const { teacherId } = useAuthStore()
  const { t } = useLanguageStore()
  const [submitting, setSubmitting] = useState(false)
  const [contracts, setContracts] = useState<any[]>([])
  
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [isAgreed, setIsAgreed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!teacherId) return
    const q = query(collection(db, 'contracts'), where('teacherId', '==', teacherId))
    const unsub = onSnapshot(q, (snap) => {
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)))
    })
    return unsub
  }, [teacherId])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    // Consider it scrolled to bottom if within 50px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 50) {
      setHasScrolledToBottom(true)
    }
  }

  const handleDownloadToS = () => {
    const element = document.createElement("a");
    const file = new Blob([TERMS_CONTENT], {type: 'text/plain;charset=utf-8'});
    element.href = URL.createObjectURL(file);
    element.download = "123English_Tutor_Terms_and_Conditions.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  const onSubmit = async () => {
    if (!isAgreed) {
      toast.error('Vui lòng đồng ý với các điều khoản')
      return
    }
    
    setSubmitting(true)
    try {
      // Fetch IP with error handling
      let ipAddress = 'Không xác định'
      try {
        const response = await fetch('https://api.ipify.org?format=json')
        if (response.ok) {
          const data = await response.json()
          ipAddress = data.ip
        }
      } catch (err) {
        console.error('Không thể lấy địa chỉ IP:', err)
        // IP not critical enough to stop the whole process if adblocker blocks it
      }

      const userAgent = navigator.userAgent;

      // Fetch teacher name for admin display
      let teacherName = 'Giáo viên'
      try {
        const tSnap = await getDoc(doc(db, 'teachers', teacherId!))
        if (tSnap.exists()) teacherName = tSnap.data().name || teacherName
      } catch {}

      await addDoc(collection(db, 'contracts'), {
        teacherId,
        teacherName,
        type: 'terms_of_service',
        status: 'agreed',
        agreedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        ipAddress,
        userAgent,
        termsVersion: "2026-05-03",
      })
      
      toast.success('Xác nhận điều khoản thành công!')
      // Reset form not needed since hasAgreedBefore will hide the UI
    } catch (e: any) {
      toast.error('Có lỗi xảy ra: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Check if they have already agreed or have an old contract
  const hasAgreedBefore = contracts.some(c => c.type === 'terms_of_service' || c.status === 'agreed' || c.status === 'pending' || c.status === 'approved')

  return (
    <div className="max-w-3xl mx-auto space-y-6 pt-2 lg:pt-6 pb-20 animate-fade-in">
      <div className="bg-gradient-to-r from-[#3BB8EB] to-[#2196F3] rounded-2xl p-6 text-white shadow-lg shadow-sky-200/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <h1 className="text-2xl font-bold relative z-10">{t('contract.title')}</h1>
        <p className="text-sm text-sky-100 mt-1 relative z-10">
          {t('contract.scroll_hint')}
        </p>
      </div>

      {!hasAgreedBefore && (
        <Card className="hover:shadow-xl transition-all duration-300 border-sky-100/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#3BB8EB]" />
          <div className="space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                <FileText className="w-5 h-5 text-[#3BB8EB]" />
                Nội dung Điều khoản & Chính sách
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadToS} className="text-xs bg-white shrink-0">
                <Download className="w-4 h-4 mr-2" />
                Tải về bản sao (.TXT)
              </Button>
            </div>

            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="bg-white border border-slate-200 rounded-xl p-4 h-[400px] overflow-y-auto text-sm text-slate-700 leading-relaxed shadow-inner scroll-smooth"
            >
              <div className="whitespace-pre-wrap">
                {TERMS_CONTENT.split('\n').map((line, i) => {
                  const trimmed = line.trim()
                  const isBoldHeading = /^(Điều \d+\.|ĐIỀU KHOẢN|CHÍNH SÁCH BẢO MẬT|HỘ KINH DOANH)/.test(trimmed)
                  return isBoldHeading ? (
                    <span key={i} className="font-bold text-slate-900">{line}{'\n'}</span>
                  ) : (
                    <span key={i}>{line}{'\n'}</span>
                  )
                })}
              </div>
            </div>

            {!hasScrolledToBottom && (
              <div className="text-center p-2.5 bg-amber-50 text-amber-700 rounded-lg text-sm border border-amber-200 animate-pulse font-medium">
                Vui lòng lướt đọc xuống cuối văn bản để có thể đánh dấu xác nhận.
              </div>
            )}

            <div className={`p-4 rounded-xl border transition-all duration-300 ${hasScrolledToBottom ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200 opacity-60 pointer-events-none'}`}>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="mt-0.5 relative flex items-center justify-center shrink-0">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer peer transition-all"
                    checked={isAgreed}
                    onChange={(e) => setIsAgreed(e.target.checked)}
                    disabled={!hasScrolledToBottom}
                  />
                </div>
                <span className="text-sm font-medium text-slate-800 select-none">
                  Tôi xác nhận đã đọc, hiểu và đồng ý với Điều khoản sử dụng và Chính sách bảo mật, đồng thời chịu trách nhiệm với mọi hoạt động phát sinh từ tài khoản.
                </span>
              </label>
            </div>

            <Button 
              fullWidth 
              size="lg" 
              onClick={onSubmit} 
              loading={submitting}
              disabled={!isAgreed}
              className="mt-4 shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 h-12"
            >
              <ShieldCheck className="w-5 h-5 mr-2" />
              Đồng ý và Xác nhận
            </Button>
          </div>
        </Card>
      )}

      {contracts.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Lịch sử hồ sơ</h2>
          <div className="space-y-3">
            {contracts.map(c => (
              <Card key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:-translate-y-1 hover:shadow-md transition-all duration-300 border-emerald-200 bg-emerald-50/30">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0 mt-1 sm:mt-0">
                    <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-900">
                      Đã xác nhận Điều khoản dịch vụ
                    </p>
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {c.agreedAt ? c.agreedAt.toDate().toLocaleString('vi-VN') : (c.createdAt ? c.createdAt.toDate().toLocaleString('vi-VN') : 'Đang xử lý...')}
                      </p>
                      {c.ipAddress && (
                        <p className="text-xs text-slate-600 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          IP: <span className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{c.ipAddress}</span>
                        </p>
                      )}
                      {c.userAgent && (
                        <p className="text-xs text-slate-600 flex items-start gap-1.5">
                          <Laptop className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-[10px] text-slate-500 break-all leading-tight">{c.userAgent}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <StatusBadge status={c.status === 'agreed' ? 'approved' : c.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
