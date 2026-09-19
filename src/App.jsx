import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Loading } from './components/ui';
import PublicLayout from './layouts/PublicLayout';
import DashboardLayout, { RequireRole } from './layouts/DashboardLayout';

import Home from './pages/public/Home';
import About from './pages/public/About';
import Register from './pages/public/Register';
import ApplicationStatus from './pages/public/ApplicationStatus';
import ResultLookup from './pages/public/ResultLookup';
import CertificateVerify from './pages/public/CertificateVerify';
import NotFound from './pages/public/NotFound';
import Login from './pages/Login';

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const Applications = lazy(() => import('./pages/admin/Applications'));
const NewApplication = lazy(() => import('./pages/admin/NewApplication'));
const Students = lazy(() => import('./pages/admin/Students'));
const Examiners = lazy(() => import('./pages/admin/Examiners'));
const Assignments = lazy(() => import('./pages/admin/Assignments'));
const Exams = lazy(() => import('./pages/admin/Exams'));
const Results = lazy(() => import('./pages/admin/Results'));
const Certificates = lazy(() => import('./pages/admin/Certificates'));
const Criteria = lazy(() => import('./pages/admin/Criteria'));
const Deductions = lazy(() => import('./pages/admin/Deductions'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Users = lazy(() => import('./pages/admin/Users'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog'));
const Messages = lazy(() => import('./pages/admin/Messages'));

const ExaminerDashboard = lazy(() => import('./pages/examiner/Dashboard'));
const MyStudents = lazy(() => import('./pages/examiner/MyStudents'));
const ExaminerExams = lazy(() => import('./pages/examiner/ExaminerExams'));
const ExamRoom = lazy(() => import('./pages/examiner/ExamRoom'));

const Appointments = lazy(() => import('./pages/shared/Appointments'));
const CertificatePrint = lazy(() => import('./pages/shared/CertificatePrint'));

const ADMINS = ['super_admin', 'admin'];
const EXAMINERS = ['examiner'];

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="register" element={<Register />} />
          <Route path="application-status" element={<ApplicationStatus />} />
          <Route path="result" element={<ResultLookup />} />
          <Route path="certificate-verification" element={<CertificateVerify />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="admin/login" element={<Login kind="admin" />} />
        <Route path="examiner/login" element={<Login kind="examiner" />} />

        <Route path="admin" element={<RequireRole roles={ADMINS} loginPath="/admin/login"><DashboardLayout portal="admin" /></RequireRole>}>
          <Route index element={<AdminDashboard />} />
          <Route path="applications" element={<Applications />} />
          <Route path="applications/new" element={<NewApplication />} />
          <Route path="students" element={<Students />} />
          <Route path="examiners" element={<Examiners />} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="appointments" element={<Appointments key="admin" portal="admin" />} />
          <Route path="exams" element={<Exams />} />
          <Route path="results" element={<Results key="all" pending={false} />} />
          <Route path="results/pending" element={<Results key="pending" pending />} />
          <Route path="certificates" element={<Certificates />} />
          <Route path="criteria" element={<Criteria />} />
          <Route path="deductions" element={<Deductions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit-log" element={<AuditLog />} />
          <Route path="messages" element={<Messages />} />
        </Route>

        <Route path="examiner" element={<RequireRole roles={EXAMINERS} loginPath="/examiner/login"><DashboardLayout portal="examiner" /></RequireRole>}>
          <Route index element={<ExaminerDashboard />} />
          <Route path="students" element={<MyStudents />} />
          <Route path="appointments" element={<Appointments key="examiner" portal="examiner" />} />
          <Route path="exams" element={<ExaminerExams key="exams" mode="exams" />} />
          <Route path="results" element={<ExaminerExams key="results" mode="results" />} />
        </Route>

        <Route path="examiner/exams/:examId" element={<RequireRole roles={EXAMINERS} loginPath="/examiner/login"><ExamRoom /></RequireRole>} />
        <Route path="certificates/:certNo/print" element={<RequireRole roles={ADMINS} loginPath="/admin/login"><CertificatePrint /></RequireRole>} />
      </Routes>
    </Suspense>
  );
}
