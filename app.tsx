// App.tsx — QA Pariksha AI
// Changes in this version:
//   • ResultsView table: "document_name" column hidden from display
//   • Test environment (UAT/SIT) set at registration, sourced from JWT
//   • No reference document / prompt file UI

import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Button, Typography, Alert, CircularProgress, IconButton,
    Tooltip, Divider, Chip, Skeleton, TextField, Tab, Tabs,
    Dialog, DialogTitle, DialogContent, DialogActions, FormHelperText,
    TablePagination, FormControl, InputLabel, MenuItem, Select,
    Accordion, AccordionSummary, AccordionDetails, Checkbox,
} from '@mui/material';
import { SelectChangeEvent } from '@mui/material/Select';
import {
    CloudUploadOutlined, Description, InfoOutline, Refresh,
    Download, ChevronLeft, ChevronRight, Menu, Person, Fullscreen,
    FullscreenExit, Clear, ExpandMore, AutoAwesome,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import axios from 'axios';
import AdminPanel from './components/AdminPanel';

// ============================================================================
// CONFIGURATION
// ============================================================================
const ENABLE_REGISTER_TAB = true;
const GENERATE_FEATURE_FILE = true;  

// Columns to hide from the results table (lowercase keys as they appear in JSON)
const HIDDEN_RESULT_COLUMNS = new Set(['document_name', 'Document Name']);
const TRADE_FINANCE_DEPT_ID = "171";

// Trade Finance column order for display and Excel export
const TF_COLUMNS = [ 
    "Sr.No", 
    "Function ID", 
    "Function Description", 
    "Sub Function ID", 
    "Sub Function Description", 
    "Pre-Condition", 
    "Test Case ID", 
    "Test Case Description", 
    "Expected Result", 
    "Priority", 
    "Positive / Negative", 
   ];


// ============================================================================
// TYPES
// ============================================================================
interface User {
    first_name: string; last_name: string; username: string;
    email?: string; departmentid?: string; role?: string;
    is_active?: number; must_change_password?: boolean; login_count?: number;
    testcase_client?: string;
    application_name?: string;
}

export interface PDFData {
    uuid: string;
    filename: string;
    total_pages: number;
    file_type?: string;
}

export interface TestCaseResult {
    document_name: string;
    uuid: string;
    testcase_client?: string;
    summary: {
        total_pages_processed: number;
        successful_generations: number;
        failed_generations: number;
    };
    combined_testcases: any[] | string;
    page_summary?: Array<{ page_number: number; status: string; testcases_count: number }>;
}

interface RagDocument {
    doc_id: string;
    filename: string;
    total_chunks: number;
    department_id?:string;
    application_name?:string;
}

// ============================================================================
// API
// ============================================================================
const API_BASE = 'http://localhost:1000/api/v1/testcase-generation';

const loginUser = async (username: string, password: string): Promise<User> => {
    const res = await fetch(`${API_BASE}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }), credentials: 'include',
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Login failed');
    const data = await res.json();
    const p    = JSON.parse(atob(data.access_token.split('.')[1]));
    return {
        first_name: p.first_name, last_name: p.last_name, username: p.sub,
        email: p.email, departmentid: p.departmentid, role: p.role,
        is_active: p.is_active, must_change_password: p.must_change_password,
        login_count: p.login_count, testcase_client: p.testcase_client || 'UAT',
        application_name: p.application_name || '',
    };
};

const registerUser = async (
    firstName: string, lastName: string, username: string,
    email: string, password: string, departmentid: string, testcaseClient: string
): Promise<void> => {
    const res = await fetch(`${API_BASE}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            first_name: firstName, last_name: lastName, username, email,
            password, departmentid, testcase_client: testcaseClient,
        }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Registration failed');
};

const initiateSSOLogin = async () => {
    try {
        const res  = await fetch(`${API_BASE}/sso/login`);
        const data = await res.json();
        window.location.href = data.authorization_url;
    } catch { alert('Failed to initiate SSO login'); }
};

const apiClient = axios.create({ baseURL: API_BASE, timeout: 900000, withCredentials: true });
apiClient.interceptors.response.use(r => r, err => {
    if (err.response?.status === 401) window.location.reload();
    return Promise.reject(err);
});

export const uploadPDF = async (file: File, demandId: string, projectId: string): Promise<PDFData> => {
    const fd = new FormData();
    fd.append('file', file); fd.append('demand_id', demandId); fd.append('project_id', projectId);
    const res = await apiClient.post('/upload-pdf-file', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data;
};

export const generateTestCases = async (payload: any) => {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 90000000); 
    try {
        const res = await fetch(`${API_BASE}/generate-testcases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error((await res.json()).detail || 'Generation failed');
        return res.json();
    } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new Error('Request timed out after 15 minutes');
        throw err;
    }
};


const fetchRagDocuments = async (): Promise<RagDocument[]> => {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(`${API_BASE}/rag-documents`, {
                credentials: 'include',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) return [];
            const data = await res.json();
            return data.documents || [];
        } catch (err: any) {
            if (err.name === 'AbortError' || attempt === 2) {
                console.warn('fetchRagDocuments: server unreachable after retries');
                return [];
            }
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
    }
    return [];
};


export const generateFeatureFile = async (payload: {
    document_name: string;
    testcases: any[];
    department_id?: string;
    testcase_client: string;
}): Promise<{ feature_content: string; document_name: string; testcase_client: string }> => {
    const res = await fetch(`${API_BASE}/generate-feature-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Feature file generation failed');
    return res.json();
};


export const pollIngestStatus = async (jobId: string): Promise<{
    status: 'running' | 'done' | 'failed';
    filename: string;
    result?: any;
    error?: string;
}> => {
    const res = await fetch(`${API_BASE}/ingest-rag/status/${jobId}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to poll ingest status');
    return res.json();
};

// ── Validation helpers ────────────────────────────────────────────────────────
const validateUsername  = (u: string) => ({ isValid: u.length >= 5 && u.length <= 30 && /^[a-zA-Z0-9_]+$/.test(u), error: u.length < 5 ? 'Min 5 chars' : u.length > 30 ? 'Max 30 chars' : !/^[a-zA-Z0-9_]+$/.test(u) ? 'Letters, numbers, underscores only' : '' });
const validatePassword  = (p: string) => ({ isValid: p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[@#$%^&*!]/.test(p), error: p.length < 8 ? 'Min 8 chars' : !/[A-Z]/.test(p) ? 'Need uppercase' : !/[a-z]/.test(p) ? 'Need lowercase' : !/[0-9]/.test(p) ? 'Need digit' : !/[@#$%^&*!]/.test(p) ? 'Need special char (@#$%^&*!)' : '' });
const validateEmail     = (e: string) => ({ isValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.toLowerCase().endsWith('@sbi.co.in'), error: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? 'Invalid email' : !e.toLowerCase().endsWith('@sbi.co.in') ? 'Must be @sbi.co.in' : '' });
const validateName      = (n: string, f: string) => ({ isValid: n.length >= 2 && n.length <= 50 && /^[a-zA-Z\s]+$/.test(n), error: n.length < 2 ? `${f} min 2 chars` : n.length > 50 ? `${f} max 50 chars` : !/^[a-zA-Z\s]+$/.test(n) ? 'Letters only' : '' });
const validateDemandId  = (v: string) => ({ isValid: v.trim().length >= 3 && v.trim().length <= 20 && /^[a-zA-Z0-9_-]+$/.test(v), error: !v.trim() ? 'Required' : v.trim().length < 3 ? 'Min 3 chars' : v.trim().length > 20 ? 'Max 20 chars' : !/^[a-zA-Z0-9_-]+$/.test(v) ? 'Letters, numbers, hyphens, underscores only' : '' });
const validateProjectId = validateDemandId;

// ============================================================================
// FOOTER
// ============================================================================
const AppFooter: React.FC = () => (
    <Box sx={{ textAlign: 'center', py: 1.5, px: 3, borderTop: '1px solid #e0e0e0', bgcolor: 'white' }}>
        <Typography variant="caption" color="text.secondary">
            ©2026 Developed and Maintained by IT-QA CoE, GITC, SBI&nbsp;&nbsp;v1.0
        </Typography>
    </Box>
);

// ============================================================================
// LOGOUT CONFIRM
// ============================================================================
const LogoutConfirmDialog: React.FC<{ open: boolean; onClose: () => void; onConfirm: () => void }> = ({ open, onClose, onConfirm }) => (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Logout</DialogTitle>
        <DialogContent><Typography variant="body2" color="text.secondary">Are you sure you want to logout?</Typography></DialogContent>
        <DialogActions>
            <Button onClick={onClose} variant="outlined">Cancel</Button>
            <Button onClick={onConfirm} variant="contained" color="error">Logout</Button>
        </DialogActions>
    </Dialog>
);

// ============================================================================
// FORCE PASSWORD RESET
// ============================================================================
const ForcePasswordResetModal: React.FC<{ open: boolean; onPasswordChanged: () => void }> = ({ open, onPasswordChanged }) => {
    const [newPwd, setNewPwd]   = useState('');
    const [confPwd, setConfPwd] = useState('');
    const [newErr, setNewErr]   = useState('');
    const [confErr, setConfErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const v = validatePassword(newPwd);
        if (!v.isValid) { setNewErr(v.error); return; }
        if (newPwd !== confPwd) { setConfErr('Passwords do not match'); return; }
        setLoading(true); setError('');
        try {
            const res = await fetch(`${API_BASE}/users/change-password`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'include', body: JSON.stringify({ new_password: newPwd }),
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
            onPasswordChanged();
        } catch (err: any) { setError(err.message); }
        finally { setLoading(false); }
    };

    return (
        <Dialog open={open} maxWidth="sm" fullWidth disableEscapeKeyDown>
            <DialogTitle sx={{ bgcolor: '#F4FCFF', borderBottom: '2px solid #1aa7d1' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#fff3cd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>🔐</Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#1f3c88' }}>Set Your Password</Typography>
                        <Typography variant="caption" color="text.secondary">Your account was created by an admin. Please set your own password.</Typography>
                    </Box>
                </Box>
            </DialogTitle>
            <DialogContent sx={{ pt: 3 }}>
                {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
                <Alert severity="info" sx={{ mb: 3 }}><Typography variant="body2">You must change the temporary password before using the application.</Typography></Alert>
                <Box component="form" onSubmit={handleSubmit}>
                    <TextField fullWidth type="password" label="New Password" value={newPwd} onChange={e => { setNewPwd(e.target.value); setNewErr(validatePassword(e.target.value).error); }} error={!!newErr} required sx={{ mb: 1 }} />
                    {newErr && <FormHelperText error sx={{ mb: 2 }}>{newErr}</FormHelperText>}
                    <TextField fullWidth type="password" label="Confirm Password" value={confPwd} onChange={e => { setConfPwd(e.target.value); setConfErr(e.target.value !== newPwd ? 'Passwords do not match' : ''); }} error={!!confErr} required sx={{ mb: 1 }} />
                    {confErr && <FormHelperText error sx={{ mb: 1 }}>{confErr}</FormHelperText>}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>≥8 chars with uppercase, lowercase, digit, special char (@#$%^&*!)</Typography>
                    <Button type="submit" variant="contained" fullWidth size="large"
                        disabled={loading || !!newErr || !!confErr || !newPwd || !confPwd}
                        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                        sx={{ background: 'linear-gradient(135deg, #1aa7d1 0%, #1f3c88 100%)', py: 1.5, fontWeight: 600, textTransform: 'none' }}>
                        {loading ? 'Saving…' : 'Set Password & Continue'}
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

// ============================================================================
// AUTH SCREEN
// ============================================================================
const REGISTER_DEPT_OPTIONS = [
    ['141', 'IT-Facility & Office Administration'],
    ['160', 'IT-Foreign Offices'],
    ['161', 'IT-Data Warehouse'],
    ['162', 'IT-Core Banking-Tech Operations'],
    ['164', 'IT-Core Banking-Operations'],
    ['166', 'IT-Development-Core Banking'],
    ['168', 'IT-Data Centre & Operations'],
    ['171', 'IT-Trade Finance & SCF'],
    ['172', 'IT-Payment System'],
    ['375', 'IT-Special Projects - Government'],
    ['377', 'IT-Partner Relationship'],
    ['378', 'IT-HRMS'],
    ['382', 'IT-Retail Loans'],
    ['385', 'IT-Complaints Management'],
    ['394', 'IT-Special Projects - Audit & Websites'],
    ['396', 'IT- Quality Assurance CoE'],
    ['398', 'IT-Platform Engineering - I'],
    ['401', 'IT-Enterprise & Technology Architecture'],
    ['402', 'IT Treasury Support And Services'],
    ['405', 'IT-ATM'],
    ['407', 'IT-UPI'],
    ['408', 'IT-Internet Banking'],
    ['409', 'IT-Business Intelligence & RFAA'],
    ['410', 'IT-Platform Engineering - II'],
    ['411', 'IT-Financial Inclusion & Government Schemes'],
    ['412', 'IT-Human Resources'],
    ['413', 'IT- Software Factory'],
    ['415', 'IT- Digital Channel Reconciliation Department'],
    ['416', 'IT- Operations and Settlement Department'],
    ['418', 'IT-Special Projects – Resources'],
    ['423', 'IT-YONO- Infra & Operations'],
    ['426', 'IT-CRM'],
    ['429', 'IT-E-Pay & Payment Gateway'],
    ['437', 'IT-Enterprise Integration Services'],
    ['439', 'IT-YONO DEVELOPMENT'],
    ['441', 'IT – FO Tech Ops'],
    ['446', 'IT-DMO'],
    ['448', 'IT-CMP'],
    ['450', 'IT-Corporate & SME Loans'],
    ['457', 'IT- Contact Centre Operations'],
    ['462', 'IT-Agri Tech'],
    ['465', 'IT-YONO 2.0 Development'],
    ['466', 'IT-Project Management Dept & Strategic Coordination'],
    ['467', 'IT-YONO Business'],
    ['468', 'IT-RRBs & SUBSIDIARIES'],
    ['470', 'IT-Governance'],
    ['475', 'IT-Regulatory Applications'],
    ['476', 'IT-Tech Operations Loans'],
    ['477', 'IT-YONO 2.0 Foundation Services & Infra'],
    ['478', 'IT-YONO 2.0 Ops'],
    ['479', 'IT-Network Operation'],
    ['480', 'IT-Network Technology'],
    ['481', 'IT-Core Banking-Tech Revamp'],
    ['482', 'IT Platform Engineering- III'],
    ['483', 'IT-ROC-Process & Control'],
    ['484', 'IT–Cloud Solutions'],
    ['485', 'IT-Software Factory Infra & OPS'],
    ['488', 'IT-JVs & Partnerships']
];

const AuthScreen: React.FC<{ onLogin: (u: User) => void }> = ({ onLogin }) => {
    const [tab, setTab]              = useState(0);
    const [loading, setLoading]      = useState(false);
    const [error, setError]          = useState('');
    const [loginUser_, setLoginUser] = useState('');
    const [loginPwd, setLoginPwd]    = useState('');
    const [loginUserErr, setLoginUserErr] = useState('');
    const [loginPwdErr, setLoginPwdErr]   = useState('');
    const [isLockedOut, setIsLockedOut]   = useState(false);
    const [lockoutSecs, setLockoutSecs]   = useState(0);

    const [rFirst, setRFirst] = useState(''); const [rFirstErr, setRFirstErr] = useState('');
    const [rLast,  setRLast]  = useState(''); const [rLastErr,  setRLastErr]  = useState('');
    const [rUser,  setRUser]  = useState(''); const [rUserErr,  setRUserErr]  = useState('');
    const [rEmail, setREmail] = useState(''); const [rEmailErr, setREmailErr] = useState('');
    const [rPwd,   setRPwd]   = useState(''); const [rPwdErr,   setRPwdErr]   = useState('');
    const [rConf,  setRConf]  = useState(''); const [rConfErr,  setRConfErr]  = useState('');
    const [rDept,  setRDept]  = useState('');
    const [rTestEnv, setRTestEnv] = useState('UAT');

    const checkLockout = async () => {
        try {
            const res = await fetch(`${API_BASE}/login-status`);
            if (!res.ok) return;
            const d = await res.json();
            if (d.locked) { setIsLockedOut(true); setLockoutSecs(d.retry_after_seconds); }
            else { setIsLockedOut(false); setLockoutSecs(0); }
        } catch { }
    };
    useEffect(() => { checkLockout(); }, []);
    useEffect(() => {
        if (!isLockedOut) return;
        if (lockoutSecs <= 0) { setIsLockedOut(false); return; }
        const t = setTimeout(() => setLockoutSecs(s => { if (s <= 1) { setIsLockedOut(false); return 0; } return s - 1; }), 1000);
        return () => clearTimeout(t);
    }, [isLockedOut, lockoutSecs]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const uv = validateUsername(loginUser_); const pv = validatePassword(loginPwd);
        if (!uv.isValid) { setLoginUserErr(uv.error); return; }
        if (!pv.isValid) { setLoginPwdErr(pv.error); return; }
        if (isLockedOut) return;
        setLoading(true); setError('');
        try {
            const user = await loginUser(loginUser_, loginPwd);
            setIsLockedOut(false); setLockoutSecs(0); onLogin(user);
        } catch (err: any) {
            setError(err.message);
            if (err.message?.includes('429') || err.message?.toLowerCase().includes('too many')) await checkLockout();
        } finally { setLoading(false); }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        const fv = validateName(rFirst, 'First name'); const lv = validateName(rLast, 'Last name');
        const uv = validateUsername(rUser); const ev = validateEmail(rEmail); const pv = validatePassword(rPwd);
        if (!fv.isValid) { setRFirstErr(fv.error); return; }
        if (!lv.isValid) { setRLastErr(lv.error); return; }
        if (!uv.isValid) { setRUserErr(uv.error); return; }
        if (!ev.isValid) { setREmailErr(ev.error); return; }
        if (!pv.isValid) { setRPwdErr(pv.error); return; }
        if (rPwd !== rConf) { setRConfErr('Passwords do not match'); return; }
        if (!rDept) { setError('Please select a department'); return; }
        setLoading(true); setError('');
        try {
            await registerUser(rFirst, rLast, rUser, rEmail, rPwd, rDept, rTestEnv);
            setTab(0); alert('Registration successful! Please login.');
        } catch (err: any) { setError(err.message); }
        finally { setLoading(false); }
    };

    const inputSx = { '& .MuiOutlinedInput-root': { '&:hover fieldset': { borderColor: '#1aa7d1' }, '&.Mui-focused fieldset': { borderColor: '#1aa7d1' } }, '& .MuiInputLabel-root.Mui-focused': { color: '#1aa7d1' } };
    const btnSx   = { background: 'linear-gradient(135deg, #1aa7d1 0%, #1f3c88 100%)', py: 1.5, fontSize: '1rem', fontWeight: 600, textTransform: 'none', '&:hover': { background: 'linear-gradient(135deg, #1f3c88 0%, #1aa7d1 100%)' }, '&:disabled': { background: 'linear-gradient(135deg, #ccc 0%, #999 100%)' } };

    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'fixed', inset: 0, backgroundImage: 'url(/icons/background_image.png)', backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }} />
            <Box sx={{ maxWidth: 700, width: '100%', p: 4, mr: 10, zIndex: 1 }}>
                <Box sx={{ bgcolor: 'white', borderRadius: 2, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                    <Box sx={{ textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                        <Box sx={{ p: 3 }}><Box component="img" src="/icons/header_logo.png" alt="SBI" sx={{ height: 60, mx: 'auto', display: 'block' }} /></Box>
                        <Box sx={{ bgcolor: '#F4FCFF', borderTop: '1px solid #1aa7d1', borderBottom: '1px solid #1aa7d1', py: 1.5, px: 3 }}>
                            <Typography variant="h5" sx={{ fontWeight: 600, color: '#1aa7d1', mb: 0.5 }}>QA Pariksha-AI</Typography>
                            <Typography variant="body2" color="text.secondary">Document Test Case Generator</Typography>
                        </Box>
                    </Box>
                    <Box sx={{ borderBottom: '1px solid #1aa7d1' }}>
                        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', fontSize: '1rem' }, '& .MuiTab-root.Mui-selected': { color: '#1aa7d1' }, '& .MuiTabs-indicator': { height: '3px', backgroundColor: '#1aa7d1' } }}>
                            <Tab label="Login" />
                            {ENABLE_REGISTER_TAB && <Tab label="Register" />}
                        </Tabs>
                    </Box>
                    {error && <Box sx={{ p: 3, pb: 0 }}><Alert severity="error" onClose={() => setError('')}>{error}</Alert></Box>}

                    {tab === 0 && (
                        <Box component="form" onSubmit={handleLogin} sx={{ p: 4 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Enter your credentials to access the application</Typography>
                            <TextField fullWidth label="Username" value={loginUser_} onChange={e => { setLoginUser(e.target.value); setLoginUserErr(validateUsername(e.target.value).error); }} required error={!!loginUserErr} sx={{ mb: 2.5, ...inputSx }} />
                            {loginUserErr && <FormHelperText error sx={{ mt: -2, mb: 2 }}>{loginUserErr}</FormHelperText>}
                            <TextField fullWidth type="password" label="Password" value={loginPwd} onChange={e => { setLoginPwd(e.target.value); setLoginPwdErr(validatePassword(e.target.value).error); }} required error={!!loginPwdErr} sx={{ mb: 2.5, ...inputSx }} />
                            {loginPwdErr && <FormHelperText error sx={{ mt: -2.5, mb: 2 }}>{loginPwdErr}</FormHelperText>}
                            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading || isLockedOut || !!loginUserErr || !!loginPwdErr} startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null} sx={btnSx}>
                                {loading ? 'Logging in…' : isLockedOut ? `Locked — ${lockoutSecs}s` : 'Login'}
                            </Button>
                            {isLockedOut && <Alert severity="error" sx={{ mt: 2 }}>Too many failed attempts. Wait <strong>{lockoutSecs}s</strong>.</Alert>}
                            <Box sx={{ mt: 3, mb: 2 }}>
                                <Divider sx={{ mb: 2, '&::before, &::after': { borderTopStyle: 'dashed', borderWidth: 2 } }}><Typography variant="caption" color="text.secondary">OR</Typography></Divider>
                                <Button variant="outlined" fullWidth size="large" onClick={initiateSSOLogin} sx={{ py: 1.5, fontWeight: 600, textTransform: 'none', borderColor: '#1aa7d1', color: '#1aa7d1', '&:hover': { borderColor: '#1f3c88', bgcolor: 'rgba(34,64,154,0.04)' } }}>Login with SSO (ADFS)</Button>
                            </Box>
                        </Box>
                    )}

                    {tab === 1 && (
                        <Box component="form" onSubmit={handleRegister} sx={{ p: 4 }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2.5 }}>
                                <Box><TextField fullWidth label="First Name" value={rFirst} onChange={e => { setRFirst(e.target.value); setRFirstErr(validateName(e.target.value, 'First name').error); }} required error={!!rFirstErr} />{rFirstErr && <FormHelperText error>{rFirstErr}</FormHelperText>}</Box>
                                <Box><TextField fullWidth label="Last Name"  value={rLast}  onChange={e => { setRLast(e.target.value);  setRLastErr(validateName(e.target.value, 'Last name').error);  }} required error={!!rLastErr}  />{rLastErr  && <FormHelperText error>{rLastErr}</FormHelperText>}</Box>
                            </Box>
                            <TextField fullWidth label="Username" value={rUser} onChange={e => { setRUser(e.target.value); setRUserErr(validateUsername(e.target.value).error); }} required error={!!rUserErr} sx={{ mb: 1 }} />
                            {rUserErr && <FormHelperText error sx={{ mb: 2.5 }}>{rUserErr}</FormHelperText>}
                            <TextField fullWidth label="Email (@sbi.co.in)" type="email" value={rEmail} onChange={e => { setREmail(e.target.value); setREmailErr(validateEmail(e.target.value).error); }} required error={!!rEmailErr} placeholder="user@sbi.co.in" sx={{ mb: 1, mt: 2.5 }} />
                            {rEmailErr && <FormHelperText error sx={{ mb: 2.5 }}>{rEmailErr}</FormHelperText>}
                            <TextField fullWidth type="password" label="Password" value={rPwd} onChange={e => { setRPwd(e.target.value); setRPwdErr(validatePassword(e.target.value).error); }} required error={!!rPwdErr} sx={{ mb: 1, mt: 2.5 }} />
                            {rPwdErr && <FormHelperText error sx={{ mb: 2.5 }}>{rPwdErr}</FormHelperText>}
                            <TextField fullWidth type="password" label="Confirm Password" value={rConf} onChange={e => { setRConf(e.target.value); setRConfErr(e.target.value !== rPwd ? 'Passwords do not match' : ''); }} required error={!!rConfErr} sx={{ mb: 1, mt: 2.5 }} />
                            {rConfErr && <FormHelperText error sx={{ mb: 2.5 }}>{rConfErr}</FormHelperText>}
                            <FormControl fullWidth required sx={{ mb: 2.5, mt: 2.5 }}>
                                <InputLabel>Department ID</InputLabel>
                                <Select value={rDept} label="Department ID" onChange={(e: SelectChangeEvent) => setRDept(e.target.value)}>
                                    <MenuItem value=""><em>Select Department</em></MenuItem>
                                    {REGISTER_DEPT_OPTIONS.map(([v, l]) => <MenuItem key={v} value={v}>{v} - {l}</MenuItem>)}
                                </Select>
                            </FormControl>
                            {/* Test Environment */}
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Test Environment</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Select your testing environment — this determines the style of test cases generated for you.</Typography>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    {(['UAT', 'SIT'] as const).map(env => (
                                        <Box key={env} onClick={() => setRTestEnv(env)} sx={{ flex: 1, p: 2, border: 2, borderColor: rTestEnv === env ? '#1aa7d1' : 'grey.300', borderRadius: 2, bgcolor: rTestEnv === env ? '#F4FCFF' : 'transparent', cursor: 'pointer', transition: 'all 0.2s', '&:hover': { borderColor: '#1aa7d1', bgcolor: '#F4FCFF' } }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: 2, borderColor: rTestEnv === env ? '#1aa7d1' : 'grey.400', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    {rTestEnv === env && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#1aa7d1' }} />}
                                                </Box>
                                                <Typography variant="body2" sx={{ fontWeight: rTestEnv === env ? 700 : 500, color: rTestEnv === env ? '#1aa7d1' : 'text.primary' }}>{env}</Typography>
                                            </Box>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 3.5 }}>{env === 'UAT' ? 'User Acceptance Testing' : 'System Integration Testing'}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading || !!rFirstErr || !!rLastErr || !!rUserErr || !!rEmailErr || !!rPwdErr || !!rConfErr || !rDept} startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null} sx={btnSx}>{loading ? 'Registering…' : 'Register'}</Button>
                        </Box>
                    )}

                    <Box sx={{ bgcolor: '#fafafa', p: 2, textAlign: 'center', borderTop: '1px solid #e0e0e0' }}>
                        <Typography variant="caption" color="text.secondary">©2026 Developed and Maintained by IT-QA CoE, GITC, SBI&nbsp;&nbsp;v1.0</Typography>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

// ============================================================================
// INSTRUCTIONS TOOLTIP
// ============================================================================
const Instructions: React.FC = () => (
    <Tooltip title={<Box sx={{ p: 1 }}><Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>📋 Instructions</Typography><Box component="ul" sx={{ pl: 2, m: 0, fontSize: '0.875rem' }}><li>Upload PDF or DOCX (max 25 MB)</li><li>Add optional custom instructions</li><li>Click Generate Testcases</li><li>Download results as JSON or Excel</li></Box><Divider sx={{ my: 1 }} /><Typography variant="caption" sx={{ fontStyle: 'italic' }}>💡 DOCX files are auto-converted to PDF. RAG context enriches generation per page.</Typography></Box>} placement="right" arrow>
        <IconButton size="small" sx={{ bgcolor: 'text.secondary', color: 'white', '&:hover': { bgcolor: '#4db7d8' } }}><InfoOutline fontSize="small" /></IconButton>
    </Tooltip>
);

// ============================================================================
// CLEAR DOCUMENT DIALOG
// ============================================================================
const ClearDocumentDialog: React.FC<{ open: boolean; onClose: () => void; onConfirm: () => void }> = ({ open, onClose, onConfirm }) => (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Clear Document</DialogTitle>
        <DialogContent><Typography variant="body2" color="text.secondary">Clear the current document? This cannot be undone.</Typography></DialogContent>
        <DialogActions><Button onClick={onClose} variant="outlined">Cancel</Button><Button onClick={onConfirm} variant="contained" color="error">Clear</Button></DialogActions>
    </Dialog>
);

// ============================================================================
// SIDEBAR UPLOAD
// ============================================================================
const SidebarUpload: React.FC<{
    onUploadSuccess: (d: PDFData) => void;
    disabled?: boolean;
    pdfData: PDFData | null;
    userPrompt: string;
    onUserPromptChange: (p: string) => void;
    onClearDocument: () => void;
    testcaseClient: string;
}> = ({ onUploadSuccess, disabled, pdfData, userPrompt, onUserPromptChange, onClearDocument, testcaseClient }) => {
    const [file, setFile]           = useState<File | null>(null);
    const [demandId, setDemandId]   = useState(''); const [demandIdErr, setDemandIdErr]   = useState('');
    const [projectId, setProjectId] = useState(''); const [projectIdErr, setProjectIdErr] = useState('');
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');
    const [clearOpen, setClearOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const MAX_FILE = 25 * 1024 * 1024; const MAX_WORDS = 300; const MAX_CHARS = 2000;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > MAX_FILE) { setError(`File too large (${(f.size/1024/1024).toFixed(2)} MB). Max 25 MB.`); setFile(null); return; }
        const valid = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(f.type) || f.name.endsWith('.pdf') || f.name.endsWith('.docx');
        if (!valid) { setError('Invalid file type. Use PDF or DOCX.'); setFile(null); return; }
        setFile(f); setError('');
    };

    const handleUpload = async () => {
        if (!file) return;
        const dv = validateDemandId(demandId); const pv = validateProjectId(projectId);
        if (!dv.isValid) { setDemandIdErr(dv.error); return; }
        if (!pv.isValid) { setProjectIdErr(pv.error); return; }
        setLoading(true); setError('');
        try {
            const data = await uploadPDF(file, demandId, projectId);
            onUploadSuccess(data);
            setFile(null); setDemandId(''); setProjectId(''); setDemandIdErr(''); setProjectIdErr('');
            if (fileRef.current) fileRef.current.value = '';
        } catch (err: any) { setError(err.response?.data?.detail || 'Upload failed'); }
        finally { setLoading(false); }
    };

    const wordCount = userPrompt.trim().split(/\s+/).filter(w => w.length > 0).length;

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>Upload PDF/DOCX</Typography>
                <Instructions />
            </Box>
            <input accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: 'none' }} id="pdf-upload-input" type="file" onChange={handleFileChange} disabled={disabled} ref={fileRef} />
            <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>Project Information</Typography>
                <TextField fullWidth label="Demand ID *" value={demandId} onChange={e => { setDemandId(e.target.value); setDemandIdErr(validateDemandId(e.target.value).error); }} error={!!demandIdErr} helperText={demandIdErr || '3–20 chars'} disabled={disabled || loading} sx={{ mb: 2 }} placeholder="e.g., DEM-2026-001" />
                <TextField fullWidth label="Project ID *" value={projectId} onChange={e => { setProjectId(e.target.value); setProjectIdErr(validateProjectId(e.target.value).error); }} error={!!projectIdErr} helperText={projectIdErr || '3–20 chars'} disabled={disabled || loading} sx={{ mb: 2 }} placeholder="e.g., PROJ-TC-001" />
            </Box>
            <Divider sx={{ my: 2 }} />
            <label htmlFor="pdf-upload-input">
                <Button variant="outlined" component="span" startIcon={<CloudUploadOutlined />} fullWidth disabled={disabled || loading} sx={{ mb: 2 }}>Choose PDF / DOCX</Button>
            </label>
            {file && <Alert severity="success" sx={{ mb: 2, py: 0.5 }}><Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>{file.name}</Typography><Typography variant="caption" color="text.secondary">{(file.size/1024/1024).toFixed(2)} MB</Typography></Alert>}
            {error && <Alert severity="error" sx={{ mb: 2, py: 0.5 }}><Typography variant="caption">{error}</Typography></Alert>}
            <Button variant="contained" fullWidth onClick={handleUpload} disabled={!file || loading || disabled || !!demandIdErr || !!projectIdErr || !demandId.trim() || !projectId.trim()} startIcon={loading ? <CircularProgress size={16} /> : <CloudUploadOutlined />}>
                {loading ? 'Processing…' : 'Process Document'}
            </Button>

            {pdfData && (
                <Box sx={{ mt: 3 }}>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Current Document</Typography>
                        <Tooltip title="Clear Document"><IconButton size="small" onClick={() => setClearOpen(true)} sx={{ color: 'error.main' }}><Clear fontSize="small" /></IconButton></Tooltip>
                    </Box>
                    <Box sx={{ p: 1.5, bgcolor: '#F4FCFF', borderRadius: 1, border: 1, borderColor: '#1aa7d1' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, wordBreak: 'break-word' }}>{pdfData.filename}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{pdfData.total_pages} pages</Typography>
                    </Box>
                    {/* Test Environment badge — read-only */}
                    <Box sx={{ mt: 2, p: 1.5, bgcolor: testcaseClient === 'SIT' ? '#f3e8ff' : '#e8f5e9', borderRadius: 1, border: 1, borderColor: testcaseClient === 'SIT' ? '#9c27b0' : '#4caf50', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Test Environment:</Typography>
                        <Chip label={testcaseClient === 'SIT' ? 'SIT — System Integration Testing' : 'UAT — User Acceptance Testing'} color={testcaseClient === 'SIT' ? 'secondary' : 'success'} size="small" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />
                    </Box>
                    {/* User Prompt */}
                    <Box sx={{ mt: 3 }}>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>Additional Instructions (Optional)</Typography>
                        <TextField id="user-prompt-input" label="Custom instructions" variant="outlined" fullWidth multiline rows={3} value={userPrompt}
                            onChange={e => { if (e.target.value.length <= MAX_CHARS && e.target.value.trim().split(/\s+/).filter(w => w.length > 0).length <= MAX_WORDS) onUserPromptChange(e.target.value); }}
                            placeholder="e.g. Focus on security test cases, include boundary value analysis…" sx={{ mb: 1 }} />
                        <Typography variant="caption" color={wordCount > MAX_WORDS ? 'error' : 'text.secondary'}>Words: {wordCount}/{MAX_WORDS}</Typography>
                    </Box>
                </Box>
            )}
            <ClearDocumentDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={() => { setClearOpen(false); onClearDocument(); }} />
        </Box>
    );
};

// ============================================================================
// LOADING SKELETON
// ============================================================================
const LoadingSkeleton: React.FC = () => (
    <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}><Skeleton variant="text" width={200} height={40} /><Skeleton variant="rectangular" width={100} height={32} /></Box>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>{[0,1,2].map(i => <Skeleton key={i} variant="rectangular" width="33%" height={80} sx={{ borderRadius: 1.5 }} />)}</Box>
        <Skeleton variant="rectangular" width="100%" height={400} sx={{ borderRadius: 1, mb: 2 }} />
        <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography variant="h6" color="text.secondary">Generating test cases…</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Extracting pages · Detecting structure · Retrieving RAG context · Generating per page · Removing duplicates.
            </Typography>
        </Box>
    </Box>
);

// ============================================================================
// GENERATE PANEL
// ============================================================================
const GeneratePanel: React.FC<{
    pdfData: PDFData;
    onGenerate: (userPrompt: string) => void;
    userPrompt: string;
    testcaseClient: string;
}> = ({ pdfData, onGenerate, userPrompt, testcaseClient }) => {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', px: 4 }}>
            <AutoAwesome sx={{ fontSize: 80, color: '#1aa7d1', mb: 3, opacity: 0.8 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>Ready to Generate</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500 }}>
                <strong>{pdfData.filename}</strong> has been processed ({pdfData.total_pages} pages).
                The system will extract text and images, retrieve domain context from the knowledge
                base if available, then generate <strong>{testcaseClient}</strong> test cases and remove duplicates.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Chip label={`${pdfData.total_pages} pages`} color="primary" variant="outlined" />
                <Chip label={testcaseClient} color={testcaseClient === 'UAT' ? 'success' : 'secondary'} />
                {userPrompt.trim() && <Chip label="Custom instructions ✓" color="info" variant="outlined" size="small" />}
            </Box>

            <Alert severity="info" sx={{ mb: 4, maxWidth: 520, textAlign: 'left' }}>
                <Typography variant="body2">
                    💡 RAG context is automatically retrieved from ingested documents for your department, if any exist.
                </Typography>
            </Alert>

            <Button
                variant="contained"
                size="large"
                onClick={() => onGenerate(userPrompt)}
                startIcon={<AutoAwesome />}
                sx={{ background: 'linear-gradient(135deg, #1aa7d1 0%, #1f3c88 100%)', py: 2, px: 6, fontSize: '1.1rem', fontWeight: 700, textTransform: 'none', borderRadius: 3, boxShadow: '0 4px 20px rgba(31,60,136,0.4)', '&:hover': { background: 'linear-gradient(135deg, #1f3c88 0%, #1aa7d1 100%)' } }}
            >
                Generate Testcases — {testcaseClient}
            </Button>
        </Box>
    );
};


// ============================================================================
// RESULTS VIEW
// ============================================================================
const ResultsView: React.FC<{ result: TestCaseResult; onReset: () => void; departmentId?: string; testcaseClient?: string }> = ({ result, onReset, departmentId, testcaseClient: tcClientProp }) => {
    const [activeTab, setActiveTab]           = useState(0);
    const [isFullscreen, setFullscreen]       = useState(false);
    const [page, setPage]                     = useState(0);
    const [rowsPerPage, setRowsPerPage]       = useState(10);
    const [columnWidths, setColumnWidths]     = useState<Record<string, number>>({});
    const [resizingCol, setResizingCol]       = useState<string | null>(null);
    const [startX, setStartX]                 = useState(0);
    const [startW, setStartW]                 = useState(0);
    const [featureContent, setFeatureContent] = useState<string>('');
    const [featureLoading, setFeatureLoading] = useState(false);
    const [featureError, setFeatureError]     = useState('');

    // ── Normalize combined_testcases: API may return a JSON string instead of array ──
    const normalizedTestcases: any[] = (() => {
        if (Array.isArray(result.combined_testcases)) {
            return result.combined_testcases;
        }
        if (typeof result.combined_testcases === 'string') {
            try {
                const parsed = JSON.parse(result.combined_testcases);
                return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
        }
        return [];
    })();

    const tcClient       = result.testcase_client || tcClientProp || 'UAT';
    const hasTC          = normalizedTestcases.length > 0;
    const isTradeFinance = (departmentId || '').trim() === TRADE_FINANCE_DEPT_ID;

    // ── Auto-generate feature file when tab 2 is selected and not yet generated ──
    const handleTabChange = async (newTab: number) => {
        setActiveTab(newTab);
        if (newTab === 2 && GENERATE_FEATURE_FILE && !featureContent && hasTC && !featureLoading) {
            await triggerFeatureGeneration();
        }
    };

    const triggerFeatureGeneration = async () => {
        if (!hasTC) return;
        setFeatureLoading(true);
        setFeatureError('');
        try {
            const data = await generateFeatureFile({
                document_name  : result.document_name,
                testcases      : normalizedTestcases,
                department_id  : departmentId,
                testcase_client: tcClient,
            });
            setFeatureContent(data.feature_content);
        } catch (err: any) {
            setFeatureError(err.message || 'Feature file generation failed');
        } finally {
            setFeatureLoading(false);
        }
    };

    const cleanData = (raw: any[]): any[] => {
        const nameField = isTradeFinance ? 'Test Case Description' : 'Test Case Name';
        const filtered  = raw.filter(tc => {
            const name = tc[nameField] ?? tc['Test Case Name'] ?? tc['Test Case ID'] ?? '';
            return String(name).trim().length > 0;
        });
        const serialized = filtered.map(tc => {
            const clean: Record<string, any> = {};
            for (const key of Object.keys(tc)) {
                const val = tc[key];
                if (val === null || val === undefined) {
                    clean[key] = '';
                } else if (Array.isArray(val)) {
                    clean[key] = val.map((item: any) =>
                        typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item)
                    ).join('\n');
                } else if (typeof val === 'object') {
                    clean[key] = JSON.stringify(val, null, 2);
                } else {
                    clean[key] = val;
                }
            }
            return clean;
        });
        return serialized.map((tc, idx) => {
            if (isTradeFinance) {
                const ordered: Record<string, any> = {};
                TF_COLUMNS.forEach(col => { ordered[col] = tc[col] ?? ''; });
                ordered['Sr.No']        = idx + 1;
                ordered['Test Case ID'] = `TC_${String(idx + 1).padStart(3, '0')}`;
                ordered['Status']       = ordered['Status'] || '';
                ordered['Remarks']      = ordered['Remarks'] || '';
                return ordered;
            }
            return { ...tc, 'Test Case ID': `TC_${String(idx + 1).padStart(3, '0')}` };
        });
    };

    const getExportName = () => {
        const parts = result.document_name.split('_');
        return parts.length >= 3
            ? `${parts[0]}_${parts[1]}_${parts[2]}_${tcClient}`
            : result.document_name;
    };

    const downloadJSON = () => {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${getExportName()}_testcases_result.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadExcel = () => {
        if (!hasTC) return;
        const data = cleanData(normalizedTestcases);
        let exportData = data;
        if (isTradeFinance && data.length > 0) {
            exportData = data.map(row => {
                const ordered: Record<string, any> = {};
                TF_COLUMNS.forEach(col => { ordered[col] = row[col] ?? ''; });
                return ordered;
            });
        }
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
        const headers = Object.keys(exportData[0] || {});
        ws['!cols'] = headers.map(h => ({
            wch: Math.min(Math.max(h.length, ...exportData.map((r: any) => String(r[h] ?? '').length)) + 2, 80),
        }));
        XLSX.writeFile(wb, `${getExportName()}_testcases_result.xlsx`);
    };

    const downloadFeatureFile = async () => {
        if (!GENERATE_FEATURE_FILE) return;
        let content = featureContent;
        // If not yet generated (user clicks download without opening the tab), generate now
        if (!content) {
            setFeatureLoading(true);
            setFeatureError('');
            try {
                const data = await generateFeatureFile({
                    document_name  : result.document_name,
                    testcases      : normalizedTestcases,
                    department_id  : departmentId,
                    testcase_client: tcClient,
                });
                content = data.feature_content;
                setFeatureContent(content);
            } catch (err: any) {
                setFeatureError(err.message || 'Feature file generation failed');
                setFeatureLoading(false);
                return;
            }
            setFeatureLoading(false);
        }
        const blob = new Blob([content], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${getExportName()}_testcases.feature`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Column resize handlers ──
    const handleMouseDown = (h: string, e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        setResizingCol(h); setStartX(e.clientX); setStartW(columnWidths[h] || 200);
    };
    const handleMouseMove = (e: MouseEvent) => {
        if (resizingCol) setColumnWidths(p => ({ ...p, [resizingCol]: Math.max(100, startW + e.clientX - startX) }));
    };
    const handleMouseUp = () => setResizingCol(null);
    useEffect(() => {
        if (resizingCol) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [resizingCol, startX, startW]);

    const renderTable = () => {
        if (!hasTC) return <Alert severity="warning">No test cases generated.</Alert>;
        const data = cleanData(normalizedTestcases);
        let headers: string[];
        if (isTradeFinance) {
            headers = TF_COLUMNS.filter(col =>
                Object.keys(data[0] || {}).includes(col) || col === 'Status' || col === 'Remarks'
            );
        } else {
            headers = Object.keys(data[0] || {}).filter(h => !HIDDEN_RESULT_COLUMNS.has(h));
        }
        const rows = data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
        return (
            <Box>
                <Box sx={{ maxHeight: isFullscreen ? 'calc(100vh - 400px)' : 'calc(100vh - 520px)', overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                            <tr>
                                {headers.map(h => (
                                    <th key={h} style={{ padding: '12px', textAlign: 'left', backgroundColor: '#1976d2', color: 'white', fontWeight: 600, borderBottom: '2px solid #fff', fontSize: '0.875rem', position: 'relative', width: columnWidths[h] || 200, minWidth: 100 }}>
                                        {h}
                                        <div onMouseDown={e => handleMouseDown(h, e)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize' }} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((tc, idx) => (
                                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f5f5f5' }}>
                                    {headers.map(h => {
                                        const v = typeof tc[h] === 'object' ? JSON.stringify(tc[h], null, 2) : String(tc[h] || '');
                                        return (
                                            <td key={h} style={{ padding: '10px 12px', borderBottom: '1px solid #e0e0e0', fontSize: '0.875rem', whiteSpace: 'pre-wrap', verticalAlign: 'top', width: columnWidths[h] || 200, maxWidth: columnWidths[h] || 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {v.replace(/\\n/g, '\n')}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Box>
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25, 50, 100]}
                    component="div"
                    count={data.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={(_, np) => setPage(np)}
                    onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                    sx={{ borderTop: 1, borderColor: 'divider' }}
                />
            </Box>
        );
    };

    const renderFeatureTab = () => {
        if (featureLoading) {
            return (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
                    <CircularProgress size={48} sx={{ color: '#1aa7d1' }} />
                    <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Generating Gherkin feature file…
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        This may take 30–60 seconds depending on the number of test cases.
                    </Typography>
                </Box>
            );
        }
        if (featureError) {
            return (
                <Box sx={{ py: 3 }}>
                    <Alert severity="error" sx={{ mb: 2 }}>{featureError}</Alert>
                    <Button variant="outlined" onClick={triggerFeatureGeneration} startIcon={<Refresh />}>
                        Retry Generation
                    </Button>
                </Box>
            );
        }
        if (!featureContent) {
            return (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
                    <Typography variant="body1" color="text.secondary">Feature file not yet generated.</Typography>
                    <Button variant="contained" onClick={triggerFeatureGeneration} startIcon={<AutoAwesome />}
                        sx={{ background: 'linear-gradient(135deg, #1aa7d1 0%, #1f3c88 100%)', textTransform: 'none', fontWeight: 600 }}>
                        Generate Feature File
                    </Button>
                </Box>
            );
        }
        return (
            <Box sx={{ maxHeight: isFullscreen ? 'calc(100vh - 300px)' : 'calc(100vh - 440px)', overflow: 'auto', bgcolor: '#1e1e2e', color: '#cdd6f4', p: 2.5, borderRadius: 1, border: '1px solid #313244' }}>
                <pre style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap', fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace', lineHeight: 1.6 }}>
                    {featureContent.split('\n').map((line, i) => {
                        let color = '#cdd6f4';
                        const trimmed = line.trim();
                        if (trimmed.startsWith('Feature:'))                                                          color = '#cba6f7';
                        else if (trimmed.startsWith('Background:'))                                                  color = '#f38ba8';
                        else if (trimmed.startsWith('Scenario Outline:') || trimmed.startsWith('Scenario:'))        color = '#89b4fa';
                        else if (/^\s*(Given|When|Then|And|But)\s/.test(line))                                      color = '#a6e3a1';
                        else if (trimmed.startsWith('@'))                                                            color = '#fab387';
                        else if (trimmed.startsWith('|'))                                                            color = '#f9e2af';
                        else if (trimmed.startsWith('Examples:'))                                                    color = '#94e2d5';
                        else if (trimmed.startsWith('As a') || trimmed.startsWith('I want') || trimmed.startsWith('So that')) color = '#6c7086';
                        else if (trimmed.startsWith('#'))                                                            color = '#6c7086';
                        return (
                            <span key={i} style={{ color, display: 'block' }}>
                                {line || '\u00A0'}
                            </span>
                        );
                    })}
                </pre>
            </Box>
        );
    };

    return (
        <Box sx={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, bgcolor: 'background.default', p: 3, overflow: 'auto' } : {}}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Test Case Results</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{result.document_name}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                        <IconButton onClick={() => setFullscreen(!isFullscreen)} size="small" sx={{ bgcolor: '#F4FCFF' }}>
                            {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
                        </IconButton>
                    </Tooltip>
                    <Button variant="outlined" size="small" startIcon={<Refresh />} onClick={() => { setFullscreen(false); onReset(); }}>
                        New Document
                    </Button>
                </Box>
            </Box>

            {/* Page summary chips */}
            {result.page_summary && result.page_summary.length > 0 && (
                <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {result.page_summary.map(ps => (
                        <Chip key={ps.page_number} size="small"
                            label={`P${ps.page_number}: ${ps.testcases_count} TCs`}
                            color={ps.status === 'success' ? 'success' : ps.status === 'skipped' ? 'default' : 'error'}
                            variant={ps.status === 'success' ? 'filled' : 'outlined'} />
                    ))}
                </Box>
            )}

            {!hasTC ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>No Test Cases Generated</Typography>
                    <Typography variant="body2">The document may not contain sufficient testable content, or all pages were skipped.</Typography>
                </Alert>
            ) : (
                <>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Total Test Cases: <strong>{cleanData(normalizedTestcases).length}</strong>
                        {cleanData(normalizedTestcases).length < normalizedTestcases.length && (
                            <span style={{ color: '#888', fontSize: '0.8em', marginLeft: 8 }}>
                                ({normalizedTestcases.length - cleanData(normalizedTestcases).length} empty-name rows removed)
                            </span>
                        )}
                        {GENERATE_FEATURE_FILE && (
                            <span style={{ marginLeft: 16, color: '#1aa7d1', fontWeight: 600 }}>
                                Feature file available
                            </span>
                        )}
                    </Alert>

                    {/* View tabs */}
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button variant={activeTab === 0 ? 'contained' : 'text'} size="small" onClick={() => handleTabChange(0)} sx={{ borderRadius: '8px 8px 0 0' }}>
                                Table View
                            </Button>
                            <Button variant={activeTab === 1 ? 'contained' : 'text'} size="small" onClick={() => handleTabChange(1)} sx={{ borderRadius: '8px 8px 0 0' }}>
                                JSON View
                            </Button>
                            {GENERATE_FEATURE_FILE && (
                                <Button
                                    variant={activeTab === 2 ? 'contained' : 'text'}
                                    size="small"
                                    onClick={() => handleTabChange(2)}
                                    sx={{
                                        borderRadius: '8px 8px 0 0',
                                        ...(activeTab === 2 ? {
                                            background: 'linear-gradient(135deg, #1aa7d1 0%, #1f3c88 100%)',
                                        } : {
                                            color: '#1aa7d1',
                                        }),
                                    }}
                                >
                                    Feature File
                                </Button>
                            )}
                        </Box>
                    </Box>

                    {/* Tab content */}
                    {activeTab === 0 && renderTable()}
                    {activeTab === 1 && (
                        <Box sx={{ maxHeight: isFullscreen ? 'calc(100vh - 300px)' : 'calc(100vh - 420px)', overflow: 'auto', bgcolor: 'grey.900', color: 'grey.100', p: 2, borderRadius: 1 }}>
                            <pre style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                                {JSON.stringify(normalizedTestcases, null, 2)}
                            </pre>
                        </Box>
                    )}
                    {activeTab === 2 && GENERATE_FEATURE_FILE && renderFeatureTab()}

                    {/* Download buttons */}
                    <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                        <Button variant="contained" startIcon={<Download />} onClick={downloadJSON} size="small" fullWidth sx={{ backgroundColor: '#1976d2' }}>
                            Download JSON
                        </Button>
                        <Button variant="contained" startIcon={<Download />} onClick={downloadExcel} size="small" fullWidth sx={{ backgroundColor: '#1976d2' }}>
                            Download Excel
                        </Button>
                        {GENERATE_FEATURE_FILE && (
                            <Button
                                variant="contained"
                                startIcon={featureLoading ? <CircularProgress size={16} color="inherit" /> : <Download />}
                                onClick={downloadFeatureFile}
                                disabled={featureLoading}
                                size="small"
                                fullWidth
                                sx={{ background: 'linear-gradient(135deg, #1aa7d1 0%, #1f3c88 100%)' }}
                            >
                                {featureLoading ? 'Generating…' : 'Download .feature'}
                            </Button>
                        )}
                    </Box>
                </>
            )}
        </Box>
    );
};

// ============================================================================
// MAIN APP
// ============================================================================
const MainApp: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
    const [pdfData, setPdfData]           = useState<PDFData | null>(null);
    const [result,  setResult]            = useState<TestCaseResult | null>(null);
    const [loading, setLoading]           = useState(false);
    const [sidebarOpen, setSidebarOpen]   = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(30);
    const [isResizing, setIsResizing]     = useState(false);
    const [userPrompt, setUserPrompt]     = useState('');
    const [logoutOpen, setLogoutOpen]     = useState(false);
    const [adminViewTC, setAdminViewTC]   = useState(false);

    const isAdmin        = user.role === 'admin';
    const testcaseClient = (user.testcase_client || 'UAT').toUpperCase();

    const handleGenerate = async (prompt: string) => {
        if (!pdfData) { alert('Upload a document first'); return; }
        setLoading(true);
        try {
            const res = await generateTestCases({
                uuid: pdfData.uuid,
                document_name: pdfData.filename,
                user_prompt: prompt || null,
                rag_doc_ids: null,
            });
            setResult(res);
        } catch (err: any) { alert('Error: ' + (err.message || 'Generation failed')); }
        finally { setLoading(false); }
    };

    const handleReset         = () => { setPdfData(null); setResult(null); setUserPrompt(''); };
    const handleClearDocument = () => { setPdfData(null); setResult(null); setUserPrompt(''); };

    const handleMouseDown = () => setIsResizing(true);
    useEffect(() => {
        if (!isResizing) return;
        const onMove = (e: MouseEvent) => { const w = (e.clientX / window.innerWidth) * 100; if (w >= 20 && w <= 50) setSidebarWidth(w); };
        const onUp   = () => setIsResizing(false);
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [isResizing]);

    const handleLogout = async () => {
        setLogoutOpen(false);
        try { await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' }); } catch { }
        onLogout();
    };

    const headerSx = { bgcolor: 'white', py: 2, px: 3, display: 'flex', alignItems: 'center', gap: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', mb: 2 };

    if (isAdmin && !adminViewTC) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
                <Box sx={headerSx}>
                    <Box component="img" src="/icons/header_logo.png" alt="SBI" sx={{ height: 40 }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#1aa7d1' }}>Admin Panel — Test Case Generator</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.9, color: '#1aa7d1' }}>State Bank of India</Typography>
                    </Box>
                    <Chip label="ADMIN" size="small" sx={{ fontWeight: 600, backgroundColor: '#e3f6fb', color: '#1aa7d1' }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Person /><Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{user.first_name} {user.last_name}</Typography>{user.email && <Typography variant="caption" color="text.secondary">{user.email}</Typography>}</Box>
                    </Box>
                    <Tooltip title="Logout">
                        <Box onClick={() => setLogoutOpen(true)} sx={{ height: 40, width: 120, cursor: 'pointer', backgroundImage: 'url(/icons/logout_button.svg)', borderRadius: 3, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', '&:hover': { opacity: 0.9 } }}>
                            <Typography sx={{ color: 'black', fontWeight: 600, fontSize: '0.9rem' }}>Logout</Typography>
                        </Box>
                    </Tooltip>
                </Box>
                <Box sx={{ p: 3 }}>
                    <Accordion defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMore />}><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Person /><Typography variant="h6" sx={{ fontWeight: 600 }}>User Management</Typography></Box></AccordionSummary>
                        <AccordionDetails><AdminPanel /></AccordionDetails>
                    </Accordion>
                    <Accordion sx={{ mt: 2 }}>
                        <AccordionSummary expandIcon={<ExpandMore />}><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Description /><Typography variant="h6" sx={{ fontWeight: 600 }}>Test Case Generation</Typography></Box></AccordionSummary>
                        <AccordionDetails>
                            <Box sx={{ textAlign: 'center', py: 3 }}>
                                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>Access the test case generation module.</Typography>
                                <Button variant="contained" onClick={() => setAdminViewTC(true)} size="large" startIcon={<Description />} sx={{ background: 'linear-gradient(135deg, #1aa7d1 0%, #1f3c88 100%)', py: 1.5, fontWeight: 600, textTransform: 'none' }}>Open Test Case Generation Module</Button>
                            </Box>
                        </AccordionDetails>
                    </Accordion>
                </Box>
                <LogoutConfirmDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={handleLogout} />
                <AppFooter />
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <Box sx={headerSx}>
                <Box component="img" src="/icons/header_logo.png" alt="SBI" sx={{ height: 40 }} />
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#1aa7d1' }}>QA Pariksha-AI</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.9, color: '#1aa7d1' }}>Document Test Case Generator</Typography>
                </Box>
                {isAdmin && adminViewTC && (
                    <>
                        <Chip label="ADMIN" color="secondary" size="small" sx={{ fontWeight: 600 }} />
                        <Button variant="outlined" size="small" onClick={() => setAdminViewTC(false)} sx={{ borderColor: '#1aa7d1', color: '#1aa7d1' }}>Back to Admin Panel</Button>
                    </>
                )}
                <Chip label={`${testcaseClient} Mode`} color={testcaseClient === 'SIT' ? 'secondary' : 'success'} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Person /><Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{user.first_name} {user.last_name}</Typography>{user.email && <Typography variant="caption" color="text.secondary">{user.email}</Typography>}</Box>
                </Box>
                <Tooltip title="Logout">
                    <Box onClick={() => setLogoutOpen(true)} sx={{ height: 35, width: 135, cursor: 'pointer', backgroundImage: 'url(/icons/logout_button.svg)', borderRadius: 3, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', '&:hover': { opacity: 0.9 } }}>
                        <Typography sx={{ color: 'black', fontWeight: 600, fontSize: '0.9rem' }}>Logout</Typography>
                    </Box>
                </Tooltip>
                <Tooltip title={sidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}>
                    <IconButton onClick={() => setSidebarOpen(!sidebarOpen)} sx={{ color: '#1aa7d1' }}>{sidebarOpen ? <ChevronLeft /> : <Menu />}</IconButton>
                </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', height: 'calc(100vh - 80px)', position: 'relative' }}>
                <Box sx={{ width: sidebarOpen ? `${sidebarWidth}%` : '0', minWidth: sidebarOpen ? 320 : 0, borderRadius: 2, p: 2, overflowY: 'auto', mt: 3, mb: 3, ml: 2, transition: isResizing ? 'none' : 'all 0.3s ease', opacity: sidebarOpen ? 1 : 0, position: 'relative', bgcolor: '#F4FCFF', border: 1, borderColor: '#1aa7d1' }}>
                    {sidebarOpen && (
                        <>
                            <SidebarUpload onUploadSuccess={d => { setPdfData(d); setResult(null); }} disabled={!!pdfData && !result} pdfData={pdfData} userPrompt={userPrompt} onUserPromptChange={setUserPrompt} onClearDocument={handleClearDocument} testcaseClient={testcaseClient} />
                            <Box onMouseDown={handleMouseDown} sx={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', bgcolor: 'transparent', '&:hover': { bgcolor: 'primary.main' }, transition: 'background-color 0.2s' }} />
                        </>
                    )}
                </Box>
                {!sidebarOpen && <IconButton onClick={() => setSidebarOpen(true)} sx={{ position: 'absolute', left: 16, top: 16, zIndex: 10, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}><ChevronRight /></IconButton>}
                <Box sx={{ flex: 1, p: 3, overflowY: 'auto', transition: isResizing ? 'none' : 'all 0.3s ease' }}>
                    <Box sx={{ bgcolor: '#F4FCFF', border: '1px solid #1aa7d1', borderRadius: 2, height: '100%', p: 3 }}>
                        {loading ? <LoadingSkeleton /> :
                        //  result  ? <ResultsView result={result} onReset={handleReset} /> :
                        //  result  ? <ResultsView result={result} onReset={handleReset} departmentId={user.departmentid} /> :
                        result  ? <ResultsView result={result} onReset={handleReset} departmentId={user.departmentid} testcaseClient={testcaseClient} /> :
                        pdfData ? <GeneratePanel pdfData={pdfData} onGenerate={handleGenerate} userPrompt={userPrompt} testcaseClient={testcaseClient} /> : (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                                <Box sx={{ textAlign: 'center' }}>
                                    <Description sx={{ fontSize: 100, mb: 2, opacity: 0.2 }} />
                                    <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Upload a Document to get started</Typography>
                                    <Typography variant="body2" color="text.secondary">Choose a PDF or DOCX file from the sidebar</Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>
            <LogoutConfirmDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={handleLogout} />
            <AppFooter />
        </Box>
    );
};

// ============================================================================
// ROOT APP
// ============================================================================
const App: React.FC = () => {
    const [user, setUser]             = useState<User | null>(null);
    const [isLoading, setIsLoading]   = useState(true);
    const [showPwdReset, setShowPwdReset] = useState(false);

    useEffect(() => {
        const init = async () => {
            const params     = new URLSearchParams(window.location.search);
            const ssoSuccess = params.get('sso_success');
            const ssoError   = params.get('sso_error');
            if (ssoSuccess) {
                window.history.replaceState({}, document.title, '/');
                try { const res = await fetch(`${API_BASE}/users/me`, { credentials: 'include' }); if (!res.ok) throw new Error(); const u = await res.json(); setUser(u); if (u.must_change_password) setShowPwdReset(true); } catch { }
                setIsLoading(false); return;
            }
            if (ssoError) { alert(decodeURIComponent(ssoError)); window.history.replaceState({}, document.title, '/'); setIsLoading(false); return; }
            try { const res = await fetch(`${API_BASE}/users/me`, { credentials: 'include' }); if (!res.ok) throw new Error(); const u = await res.json(); setUser(u); if (u.must_change_password) setShowPwdReset(true); } catch { }
            setIsLoading(false);
        };
        init();
    }, []);

    const handleLogout = async () => {
        try { await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' }); } catch { }
        setUser(null); setShowPwdReset(false);
    };

    if (isLoading) return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5' }}>
            <Box sx={{ textAlign: 'center' }}><CircularProgress size={60} sx={{ mb: 2 }} /><Typography variant="h6" color="text.secondary">Loading…</Typography></Box>
        </Box>
    );

    if (user && showPwdReset) return (
        <>
            <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }} />
            <ForcePasswordResetModal open={true} onPasswordChanged={async () => {
                setShowPwdReset(false);
                try { const res = await fetch(`${API_BASE}/users/me`, { credentials: 'include' }); if (res.ok) setUser(await res.json()); }
                catch { setUser(p => p ? { ...p, must_change_password: false } : p); }
            }} />
        </>
    );

    return user ? <MainApp user={user} onLogout={handleLogout} /> : <AuthScreen onLogin={u => { setUser(u); if (u.must_change_password) setShowPwdReset(true); }} />;
};

export default App;
