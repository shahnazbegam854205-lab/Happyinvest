const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();

// ==================== RATE LIMITING SETUP ====================
const requestCounts = new Map();

const rateLimiter = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    const endpoint = req.path;
    const key = `${ip}:${endpoint}`;
    const now = Math.floor(Date.now() / 60000); // Current minute
    
    // Get current minute's count
    const minuteKey = `${key}:${now}`;
    const currentCount = requestCounts.get(minuteKey) || 0;
    
    // Check if exceeded 60 requests per minute
    if (currentCount >= 60) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again in a minute.'
        });
    }
    
    // Increment count
    requestCounts.set(minuteKey, currentCount + 1);
    
    // Clean up old entries (older than 5 minutes)
    setTimeout(() => {
        requestCounts.delete(minuteKey);
    }, 5 * 60 * 1000);
    
    next();
};

// Apply rate limiting to all routes
app.use(rateLimiter);

// ==================== EXPRESS MIDDLEWARE ====================
app.use(cors());
app.use(express.json());

// ==================== FIREBASE INITIALIZATION ====================
let db = null;

try {
    console.log('🚀 Initializing Firebase...');
    
    const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
        token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: process.env.FIREBASE_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
        universe_domain: "googleapis.com"
    };
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    
    db = admin.database();
    console.log('✅ Firebase initialized successfully');
    
} catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    try {
        console.log('🔄 Trying fallback initialization...');
        const serviceAccount = require('./firebase-service-account.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://happy-invest-default-rtdb.firebaseio.com"
        });
        db = admin.database();
        console.log('✅ Firebase initialized with fallback');
    } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError.message);
        process.exit(1);
    }
}

// ==================== HELPER FUNCTIONS ====================
const generateUserId = () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateReferralCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateTransactionId = () => `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateInvestmentId = () => `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateWithdrawalId = () => `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateRechargeId = () => `recharge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateGiftCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};
const generateBanId = () => `ban_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// ==================== CHEAT DETECTION & BAN SYSTEM ====================
const detectAndBanCheater = async (userId, reason, details) => {
    try {
        const banId = generateBanId();
        const banData = {
            id: banId,
            userId: userId,
            reason: reason,
            details: details,
            bannedAt: new Date().toISOString(),
            bannedBy: 'system',
            status: 'active',
            expiresAt: null // Permanent ban
        };
        
        // Save ban record
        await db.ref(`bans/${userId}`).set(banData);
        
        // Update user status to banned
        await db.ref(`users/${userId}/status`).set('banned');
        
        // Log cheat attempt
        await db.ref(`cheatLogs/${userId}/${Date.now()}`).set({
            timestamp: Date.now(),
            reason: reason,
            details: details,
            action: 'banned'
        });
        
        console.log(`🔨 CHEATER BANNED: ${userId} - ${reason}`);
        return true;
    } catch (error) {
        console.error('Ban error:', error);
        return false;
    }
};

const checkIfBanned = async (userId) => {
    try {
        const banSnapshot = await db.ref(`bans/${userId}`).once('value');
        return banSnapshot.exists();
    } catch (error) {
        return false;
    }
};

// ==================== SIMPLE PASSWORD FUNCTIONS ====================
const verifyPassword = (password, storedPassword) => {
    return password === storedPassword;
};

// ==================== ADMIN MIDDLEWARE ====================
const checkAdmin = (req, res, next) => {
    const adminPassword = req.headers['admin-password'] || req.body.adminPassword;
    const correctPassword = process.env.ADMIN_PASSWORD || 'random';
    
    if (adminPassword === correctPassword) {
        next();
    } else {
        res.status(401).json({ 
            success: false, 
            message: 'Unauthorized' 
        });
    }
};

// ==================== UPDATED INVESTMENT PLANS ====================
const NEW_PLANS = {
    // BASIC PLANS - DAILY WITHDRAWAL ALLOWED
    "basic_608": {
        id: "basic_608",
        name: "Basic ₹608",
        price: 608,
        currency: "₹",
        duration: 15,
        dailyIncome: 60,
        totalIncome: 900,
        type: "basic",
        category: "basic",
        withdrawalType: "daily",
        minWithdrawal: 200,
        dailyWithdrawal: true,
        lockedBalance: false
    },
    "basic_940": {
        id: "basic_940",
        name: "Basic ₹940",
        price: 940,
        currency: "₹",
        duration: 20,
        dailyIncome: 70,
        totalIncome: 1400,
        type: "basic",
        category: "basic",
        withdrawalType: "daily",
        minWithdrawal: 200,
        dailyWithdrawal: true,
        lockedBalance: false
    },
    "basic_1500": {
        id: "basic_1500",
        name: "Basic ₹1500",
        price: 1500,
        currency: "₹",
        duration: 28,
        dailyIncome: 120,
        totalIncome: 3560,
        type: "basic",
        category: "basic",
        withdrawalType: "daily",
        minWithdrawal: 200,
        dailyWithdrawal: true,
        lockedBalance: false
    },
    
    // VIP PLANS - LOCKED BALANCE (END TERM WITHDRAWAL)
    "vip_3000": {
        id: "vip_3000",
        name: "VIP ₹3000",
        price: 3000,
        currency: "₹",
        duration: 28,
        dailyIncome: 400,
        totalIncome: 11200,
        type: "vip",
        category: "vip",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    "vip_4500": {
        id: "vip_4500",
        name: "VIP ₹4500",
        price: 4500,
        currency: "₹",
        duration: 35,
        dailyIncome: 500,
        totalIncome: 17500,
        type: "vip",
        category: "vip",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    "vip_6000": {
        id: "vip_6000",
        name: "VIP ₹6000",
        price: 6000,
        currency: "₹",
        duration: 60,
        dailyIncome: 780,
        totalIncome: 46800,
        type: "vip",
        category: "vip",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    
    // RICH PLANS - EXISTING (LOCKED BALANCE)
    "rich_25000": {
        id: "rich_25000",
        name: "Rich ₹25000",
        price: 25000,
        currency: "₹",
        duration: 36,
        dailyIncome: 6125,
        totalIncome: 220500,
        type: "rich",
        category: "rich",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    "rich_50000": {
        id: "rich_50000",
        name: "Rich ₹50000",
        price: 50000,
        currency: "₹",
        duration: 39,
        dailyIncome: 12250,
        totalIncome: 477750,
        type: "rich",
        category: "rich",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    "rich_75000": {
        id: "rich_75000",
        name: "Rich ₹75000",
        price: 75000,
        currency: "₹",
        duration: 42,
        dailyIncome: 18375,
        totalIncome: 771750,
        type: "rich",
        category: "rich",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    "rich_100000": {
        id: "rich_100000",
        name: "Rich ₹100000",
        price: 100000,
        currency: "₹",
        duration: 45,
        dailyIncome: 24500,
        totalIncome: 1102500,
        type: "rich",
        category: "rich",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    
    // ULTIMATE PLANS - EXISTING (LOCKED BALANCE)
    "ultimate_150000": {
        id: "ultimate_150000",
        name: "Ultimate ₹150000",
        price: 150000,
        currency: "₹",
        duration: 48,
        dailyIncome: 36750,
        totalIncome: 1764000,
        type: "ultimate",
        category: "ultimate",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    "ultimate_250000": {
        id: "ultimate_250000",
        name: "Ultimate ₹250000",
        price: 250000,
        currency: "₹",
        duration: 51,
        dailyIncome: 61250,
        totalIncome: 3123750,
        type: "ultimate",
        category: "ultimate",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    },
    "ultimate_500000": {
        id: "ultimate_500000",
        name: "Ultimate ₹500000",
        price: 500000,
        currency: "₹",
        duration: 54,
        dailyIncome: 122500,
        totalIncome: 6615000,
        type: "ultimate",
        category: "ultimate",
        withdrawalType: "end",
        minWithdrawal: 200,
        dailyWithdrawal: false,
        lockedBalance: true
    }
};

// ==================== TRUST WITHDRAWAL SYSTEM ====================
const generateDemoWithdrawals = async () => {
    console.log('🔄 Generating demo withdrawals for trust building...');
    
    const demoUsers = [
        { name: "Amit Sharma", phone: "9876543210" },
        { name: "Priya Patel", phone: "8765432109" },
        { name: "Raj Kumar", phone: "7654321098" },
        { name: "Sneha Singh", phone: "6543210987" },
        { name: "Vikram Yadav", phone: "5432109876" }
    ];
    
    const banks = [
        { bankName: "HDFC Bank", ifsc: "HDFC0000123" },
        { bankName: "SBI Bank", ifsc: "SBIN0000567" },
        { bankName: "ICICI Bank", ifsc: "ICIC0000890" },
        { bankName: "Axis Bank", ifsc: "UTIB0000345" }
    ];
    
    const withdrawals = [];
    
    for (let i = 0; i < 15; i++) {
        const randomUser = demoUsers[Math.floor(Math.random() * demoUsers.length)];
        const randomBank = banks[Math.floor(Math.random() * banks.length)];
        const randomAmount = Math.floor(Math.random() * (50000 - 1000 + 1)) + 1000;
        const daysAgo = Math.floor(Math.random() * 30);
        const randomDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        
        const withdrawalId = `demo_wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const demoWithdrawal = {
            id: withdrawalId,
            userId: `demo_user_${i}`,
            userName: randomUser.name,
            userPhone: randomUser.phone,
            amount: randomAmount,
            bankDetails: {
                bankName: randomBank.bankName,
                accountNumber: `XXXXXX${Math.floor(1000 + Math.random() * 9000)}`,
                ifscCode: randomBank.ifsc,
                accountHolder: randomUser.name
            },
            date: randomDate.toISOString(),
            completedDate: new Date(randomDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
            status: 'completed',
            processedBy: 'system',
            processedAt: new Date(randomDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
            isDemo: true,
            note: 'System generated for trust building',
            transactionId: `TXN${Math.floor(10000000 + Math.random() * 90000000)}`,
            utrNumber: `UTR${Math.floor(100000000000 + Math.random() * 900000000000)}`,
            displayName: randomUser.name.charAt(0) + "***" + randomUser.name.split(' ')[1]?.charAt(0),
            displayPhone: randomUser.phone.slice(0, 3) + "****" + randomUser.phone.slice(7),
            type: 'demo'
        };
        
        withdrawals.push(demoWithdrawal);
        
        await db.ref(`trustWithdrawals/demo/${withdrawalId}`).set(demoWithdrawal);
        await db.ref(`trustWithdrawals/public/${withdrawalId}`).set(demoWithdrawal);
    }
    
    console.log(`✅ Generated ${withdrawals.length} demo withdrawals`);
    return withdrawals;
};

// Initialize demo withdrawals on server start
const initializeDemoWithdrawals = async () => {
    try {
        const demoSnapshot = await db.ref('trustWithdrawals/demo').once('value');
        if (!demoSnapshot.exists() || Object.keys(demoSnapshot.val()).length < 10) {
            await generateDemoWithdrawals();
        }
    } catch (error) {
        console.error('Demo withdrawals initialization error:', error);
    }
};

// ==================== API ENDPOINTS ====================

// 1. USER REGISTRATION
app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, password, referralCode } = req.body;
        
        if (!name || !phone || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        if (phone.length !== 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid phone number' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters' 
            });
        }
        
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('phone').equalTo(phone).once('value');
        
        if (snapshot.exists()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number already registered' 
            });
        }
        
        const userId = generateUserId();
        const userReferralCode = generateReferralCode();
        
        const userData = {
            id: userId,
            name: name.trim(),
            phone: phone,
            password: password,
            referralCode: userReferralCode,
            referredBy: referralCode || null,
            referredByCode: referralCode || null,
            balance: 0,
            lockedBalance: 0,
            rechargeBalance: 0,
            withdrawn: 0,
            totalEarnings: 0,
            totalCommission: 0,
            joinDate: new Date().toISOString(),
            status: 'active',
            level: 1,
            teamCount: 0,
            referralEarnings: 0,
            referralLink: `https://richday.vercel.app/register?ref=${userReferralCode}`,
            bankDetails: null,
            dailyCheckin: {
                lastCheckin: null,
                streak: 0
            },
            referrals: [],
            hasInvested: false,
            firstInvestmentDate: null,
            totalInvestment: 0,
            totalRecharged: 0,
            trustWithdrawalsCount: 0,
            dailyWithdrawalCount: 0,
            lastWithdrawalDate: null,
            cheatAttempts: 0,
            vipBalance: 0,
            richBalance: 0,
            ultimateBalance: 0
        };
        
        await db.ref(`users/${userId}`).set(userData);
        
        if (referralCode) {
            try {
                const referrerSnapshot = await usersRef.orderByChild('referralCode').equalTo(referralCode).once('value');
                
                if (referrerSnapshot.exists()) {
                    referrerSnapshot.forEach(async (childSnapshot) => {
                        const referrerId = childSnapshot.key;
                        const referrerData = childSnapshot.val();
                        
                        const newTeamCount = (referrerData.teamCount || 0) + 1;
                        const newReferrals = [...(referrerData.referrals || []), {
                            userId: userId,
                            name: name,
                            phone: phone,
                            joinDate: new Date().toISOString(),
                            hasInvested: false,
                            totalInvested: 0,
                            commissionEarned: 0,
                            referralCompleted: false
                        }];
                        
                        await db.ref(`users/${referrerId}`).update({
                            teamCount: newTeamCount,
                            referrals: newReferrals
                        });
                        
                        await db.ref(`teams/${referrerId}/${userId}`).set({
                            userId: userId,
                            name: name,
                            phone: phone,
                            joinDate: new Date().toISOString(),
                            level: 1,
                            hasInvested: false,
                            totalInvested: 0,
                            commissionPaid: 0,
                            referralCompleted: false
                        });
                    });
                }
            } catch (referralError) {
                console.error('Referral processing error:', referralError);
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Registration successful',
            userId: userId,
            referralCode: userReferralCode
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});

// 2. USER LOGIN (WITH BAN CHECK)
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        
        if (!phone || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone and password required' 
            });
        }
        
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('phone').equalTo(phone).once('value');
        
        if (!snapshot.exists()) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        let userData = null;
        let userId = null;
        
        snapshot.forEach((childSnapshot) => {
            userId = childSnapshot.key;
            userData = childSnapshot.val();
        });
        
        if (!userData || !userData.password) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid user data' 
            });
        }
        
        // Check if user is banned
        const isBanned = await checkIfBanned(userId);
        if (isBanned) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account suspended. Contact admin.' 
            });
        }
        
        const isValid = verifyPassword(password, userData.password);
        
        if (isValid) {
            const userResponse = {
                id: userId,
                ...userData
            };
            delete userResponse.password;
            
            res.json({ 
                success: true, 
                message: 'Login successful',
                user: userResponse
            });
        } else {
            res.status(401).json({ 
                success: false, 
                message: 'Invalid password' 
            });
        }
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});

// 3. GET USER DATA
app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const snapshot = await db.ref(`users/${userId}`).once('value');
        
        if (!snapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const userData = snapshot.val();
        if (userData.password) {
            delete userData.password;
        }
        
        res.json({ 
            success: true, 
            user: userData 
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 4. CREATE RECHARGE REQUEST
app.post('/api/recharge', async (req, res) => {
    try {
        const { userId, amount, paymentMethod, transactionId, upiId, screenshotUrl } = req.body;
        
        if (!userId || !amount || amount < 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum recharge amount is ₹100' 
            });
        }
        
        // Check if user is banned
        const isBanned = await checkIfBanned(userId);
        if (isBanned) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account suspended. Cannot recharge.' 
            });
        }
        
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const rechargeId = generateRechargeId();
        const rechargeData = {
            id: rechargeId,
            userId: userId,
            userName: userSnapshot.val().name,
            userPhone: userSnapshot.val().phone,
            amount: parseFloat(amount),
            paymentMethod: paymentMethod || 'UPI',
            transactionId: transactionId || null,
            upiId: upiId || null,
            screenshotUrl: screenshotUrl || null,
            date: new Date().toISOString(),
            status: 'pending',
            approvedBy: null,
            approvedAt: null,
            createdAt: new Date().toISOString()
        };
        
        await db.ref(`recharges/${rechargeId}`).set(rechargeData);
        
        res.json({ 
            success: true, 
            message: 'Recharge request submitted. Waiting for admin approval.',
            rechargeId: rechargeId,
            note: 'Your recharge will be processed within 2-4 hours after admin verification.'
        });
        
    } catch (error) {
        console.error('Recharge error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 5. GET INVESTMENT PLANS
app.get('/api/plans', async (req, res) => {
    try {
        res.json({ 
            success: true, 
            plans: NEW_PLANS 
        });
        
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 6. INVEST IN PLAN (WITH ₹110 REFERRAL)
app.post('/api/invest', async (req, res) => {
    try {
        const { userId, planId } = req.body;
        
        if (!userId || !planId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID and Plan ID required' 
            });
        }
        
        // Check if user is banned
        const isBanned = await checkIfBanned(userId);
        if (isBanned) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account suspended. Cannot invest.' 
            });
        }
        
        const plan = NEW_PLANS[planId];
        
        if (!plan) {
            return res.status(404).json({ 
                success: false, 
                message: 'Plan not found' 
            });
        }
        
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const userData = userSnapshot.val();
        
        if (userData.balance < plan.price) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient balance' 
            });
        }
        
        const newBalance = userData.balance - plan.price;
        await db.ref(`users/${userId}`).update({
            balance: newBalance,
            totalInvestment: (userData.totalInvestment || 0) + plan.price,
            hasInvested: true,
            firstInvestmentDate: userData.firstInvestmentDate || new Date().toISOString(),
            lastInvestmentDate: new Date().toISOString()
        });
        
        const investmentId = generateInvestmentId();
        const investmentTime = Date.now();
        const nextPayoutTime = investmentTime + (24 * 60 * 60 * 1000); // 24 hours later
        
        const investmentData = {
            id: investmentId,
            userId: userId,
            planId: planId,
            planName: plan.name,
            amount: plan.price,
            dailyIncome: plan.dailyIncome,
            totalIncome: plan.totalIncome,
            investmentTime: investmentTime,
            nextPayoutTime: nextPayoutTime,
            lastPayoutTime: null,
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000).toISOString(),
            status: 'active',
            daysRemaining: plan.duration,
            totalEarned: 0,
            payoutCount: 0,
            expectedTotal: plan.totalIncome,
            isActive: true,
            lastUpdated: new Date().toISOString(),
            planType: plan.type,
            lockedBalance: plan.lockedBalance || false,
            withdrawalType: plan.withdrawalType || 'daily'
        };
        
        await db.ref(`investments/${userId}/${investmentId}`).set(investmentData);
        
        const transactionId = generateTransactionId();
        await db.ref(`transactions/${userId}/${transactionId}`).set({
            id: transactionId,
            type: 'investment',
            amount: plan.price,
            planId: planId,
            planName: plan.name,
            date: new Date().toISOString(),
            status: 'completed'
        });
        
        // ✅ ₹110 REFERRAL SYSTEM (First investment pe hi)
        if (userData.referredByCode && !userData.referralCompleted) {
            const referrerSnapshot = await db.ref('users')
                .orderByChild('referralCode')
                .equalTo(userData.referredByCode)
                .once('value');
            
            if (referrerSnapshot.exists()) {
                referrerSnapshot.forEach(async (childSnapshot) => {
                    const referrerId = childSnapshot.key;
                    const referrerData = childSnapshot.val();
                    
                    // Check if referrer already got commission for this user
                    const alreadyGot = referrerData.referrals?.some(
                        ref => ref.userId === userId && ref.commissionEarned > 0
                    );
                    
                    if (!alreadyGot) {
                        // ✅ Fixed ₹110 commission
                        const commissionAmount = 110;
                        
                        const newReferrerBalance = (referrerData.balance || 0) + commissionAmount;
                        const newTotalCommission = (referrerData.totalCommission || 0) + commissionAmount;
                        const newReferralEarnings = (referrerData.referralEarnings || 0) + commissionAmount;
                        
                        await db.ref(`users/${referrerId}`).update({
                            balance: newReferrerBalance,
                            totalCommission: newTotalCommission,
                            referralEarnings: newReferralEarnings
                        });
                        
                        // Update team record
                        await db.ref(`teams/${referrerId}/${userId}`).update({
                            hasInvested: true,
                            totalInvested: plan.price,
                            commissionPaid: commissionAmount,
                            lastCommissionDate: new Date().toISOString(),
                            referralCompleted: true
                        });
                        
                        // Update referrals array
                        const updatedReferrals = (referrerData.referrals || []).map(ref => {
                            if (ref.userId === userId) {
                                return {
                                    ...ref,
                                    hasInvested: true,
                                    totalInvested: plan.price,
                                    commissionEarned: commissionAmount,
                                    lastInvestmentDate: new Date().toISOString(),
                                    referralCompleted: true
                                };
                            }
                            return ref;
                        });
                        
                        await db.ref(`users/${referrerId}`).update({
                            referrals: updatedReferrals
                        });
                        
                        // Mark user's referral as completed
                        await db.ref(`users/${userId}/referralCompleted`).set(true);
                        
                        // Commission transaction
                        const commissionTransactionId = generateTransactionId();
                        await db.ref(`transactions/${referrerId}/${commissionTransactionId}`).set({
                            id: commissionTransactionId,
                            type: 'referral_commission',
                            amount: commissionAmount,
                            fromUserId: userId,
                            fromUserName: userData.name,
                            investmentAmount: plan.price,
                            planName: plan.name,
                            date: new Date().toISOString(),
                            status: 'completed',
                            note: `₹110 referral bonus from ${userData.name}`
                        });
                    }
                });
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Investment successful',
            investmentId: investmentId,
            newBalance: newBalance,
            dailyIncome: plan.dailyIncome,
            nextPayout: new Date(nextPayoutTime).toLocaleString(),
            totalDays: plan.duration,
            totalReturn: plan.totalIncome,
            withdrawalType: plan.withdrawalType
        });
        
    } catch (error) {
        console.error('Invest error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 7. GET USER INVESTMENTS
app.get('/api/user-investments/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const snapshot = await db.ref(`investments/${userId}`).once('value');
        const investments = snapshot.val() || {};
        
        res.json({ 
            success: true, 
            investments: investments 
        });
        
    } catch (error) {
        console.error('Get investments error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 8. CREATE WITHDRAWAL REQUEST (WITH DAILY LIMIT & ₹200 MINIMUM)
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, bankDetails } = req.body;
        
        // ✅ Minimum ₹200 check
        if (!userId || !amount || amount < 200) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum withdrawal amount is ₹200' 
            });
        }
        
        // Check if user is banned
        const isBanned = await checkIfBanned(userId);
        if (isBanned) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account suspended. Cannot withdraw.' 
            });
        }
        
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const userData = userSnapshot.val();
        const today = new Date().toDateString();
        const lastWithdrawal = userData.lastWithdrawalDate;
        
        // ✅ Daily ek baar withdrawal check
        if (lastWithdrawal && new Date(lastWithdrawal).toDateString() === today) {
            return res.status(400).json({ 
                success: false, 
                message: 'Only one withdrawal allowed per day. Try again tomorrow.' 
            });
        }
        
        // Check available balance
        const availableBalance = userData.balance || 0;
        
        if (availableBalance < amount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient balance' 
            });
        }
        
        // Check if bank details are saved
        if (!userData.bankDetails) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please save bank details first' 
            });
        }
        
        const withdrawalId = generateWithdrawalId();
        const withdrawalData = {
            id: withdrawalId,
            userId: userId,
            userName: userData.name,
            userPhone: userData.phone,
            amount: parseFloat(amount),
            bankDetails: bankDetails || userData.bankDetails,
            date: new Date().toISOString(),
            status: 'pending',
            processedBy: null,
            processedAt: null,
            isDemo: false,
            type: 'real'
        };
        
        await db.ref(`withdrawals/${withdrawalId}`).set(withdrawalData);
        
        const newBalance = userData.balance - amount;
        await db.ref(`users/${userId}`).update({
            balance: newBalance,
            withdrawn: (userData.withdrawn || 0) + amount,
            lastWithdrawalDate: new Date().toISOString(),
            dailyWithdrawalCount: (userData.dailyWithdrawalCount || 0) + 1
        });
        
        const transactionId = generateTransactionId();
        await db.ref(`transactions/${userId}/${transactionId}`).set({
            id: transactionId,
            type: 'withdrawal_request',
            amount: amount,
            status: 'pending',
            date: new Date().toISOString(),
            withdrawalId: withdrawalId
        });
        
        res.json({ 
            success: true, 
            message: 'Withdrawal request submitted. Will be processed within 24-48 hours.',
            withdrawalId: withdrawalId,
            newBalance: newBalance,
            note: 'Daily withdrawal limit: 1 per day'
        });
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 9. SAVE BANK DETAILS
app.post('/api/save-bank', async (req, res) => {
    try {
        const { userId, bankDetails } = req.body;
        
        if (!userId || !bankDetails) {
            return res.status(400).json({ 
                success: false, 
                message: 'Bank details required' 
            });
        }
        
        await db.ref(`users/${userId}`).update({
            bankDetails: bankDetails
        });
        
        res.json({ 
            success: true, 
            message: 'Bank details saved successfully'
        });
        
    } catch (error) {
        console.error('Save bank error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 10. DAILY CHECK-IN
app.post('/api/checkin', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID required' 
            });
        }
        
        const userRef = db.ref(`users/${userId}`);
        const snapshot = await userRef.once('value');
        
        if (!snapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const userData = snapshot.val();
        const today = new Date().toDateString();
        const lastCheckin = userData.dailyCheckin?.lastCheckin;
        
        if (lastCheckin && new Date(lastCheckin).toDateString() === today) {
            return res.json({ 
                success: false, 
                message: 'Already checked in today' 
            });
        }
        
        let reward = 50;
        let streak = userData.dailyCheckin?.streak || 0;
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastCheckin && new Date(lastCheckin).toDateString() === yesterday.toDateString()) {
            streak += 1;
        } else {
            streak = 1;
        }
        
        if (streak % 7 === 0) {
            reward = 500;
        }
        
        await userRef.update({
            balance: (userData.balance || 0) + reward,
            'dailyCheckin.lastCheckin': new Date().toISOString(),
            'dailyCheckin.streak': streak
        });
        
        const transactionId = generateTransactionId();
        await db.ref(`transactions/${userId}/${transactionId}`).set({
            id: transactionId,
            type: 'checkin',
            amount: reward,
            date: new Date().toISOString(),
            streak: streak
        });
        
        res.json({ 
            success: true, 
            message: 'Check-in successful',
            reward: reward,
            streak: streak,
            newBalance: (userData.balance || 0) + reward
        });
        
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 11. CHECK CHECK-IN STATUS
app.get('/api/checkin-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const snapshot = await db.ref(`users/${userId}/dailyCheckin`).once('value');
        const checkinData = snapshot.val() || {};
        
        const today = new Date().toDateString();
        const lastCheckin = checkinData.lastCheckin;
        const checkedInToday = lastCheckin && new Date(lastCheckin).toDateString() === today;
        
        res.json({ 
            success: true, 
            checkedInToday: checkedInToday,
            streak: checkinData.streak || 0,
            lastCheckin: lastCheckin
        });
        
    } catch (error) {
        console.error('Check-in status error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 12. REDEEM GIFT CODE
app.post('/api/redeem-gift', async (req, res) => {
    try {
        const { userId, giftCode } = req.body;
        
        if (!userId || !giftCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID and Gift Code required' 
            });
        }
        
        // Check if user is banned
        const isBanned = await checkIfBanned(userId);
        if (isBanned) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account suspended. Cannot redeem.' 
            });
        }
        
        const codeSnapshot = await db.ref(`giftCodes/${giftCode}`).once('value');
        if (!codeSnapshot.exists()) {
            return res.json({ 
                success: false, 
                message: 'Invalid gift code' 
            });
        }
        
        const codeData = codeSnapshot.val();
        
        if (codeData.status !== 'active') {
            return res.json({ 
                success: false, 
                message: 'Gift code already used or expired' 
            });
        }
        
        if (codeData.createdFor && codeData.createdFor !== userId) {
            return res.json({ 
                success: false, 
                message: 'This gift code is not for you' 
            });
        }
        
        const userRef = db.ref(`users/${userId}`);
        const userSnapshot = await userRef.once('value');
        const userData = userSnapshot.val();
        
        const newBalance = (userData.balance || 0) + codeData.amount;
        await userRef.update({
            balance: newBalance
        });
        
        await db.ref(`giftCodes/${giftCode}`).update({
            status: 'used',
            usedBy: userId,
            usedAt: new Date().toISOString(),
            usedCount: (codeData.usedCount || 0) + 1
        });
        
        const transactionId = generateTransactionId();
        await db.ref(`transactions/${userId}/${transactionId}`).set({
            id: transactionId,
            type: 'gift_code',
            amount: codeData.amount,
            giftCode: giftCode,
            date: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            message: 'Gift code redeemed successfully',
            amount: codeData.amount,
            newBalance: newBalance
        });
        
    } catch (error) {
        console.error('Redeem gift error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 13. GET TEAM STATS
app.get('/api/team-stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const teamSnapshot = await db.ref(`teams/${userId}`).once('value');
        const teamMembers = teamSnapshot.val() || {};
        
        let totalMembers = Object.keys(teamMembers).length;
        let activeInvestors = 0;
        let totalInvestment = 0;
        let totalCommission = 0;
        
        Object.values(teamMembers).forEach(member => {
            if (member.hasInvested) {
                activeInvestors++;
                totalInvestment += member.totalInvested || 0;
                totalCommission += member.commissionPaid || 0;
            }
        });
        
        res.json({ 
            success: true, 
            stats: {
                totalMembers: totalMembers,
                activeInvestors: activeInvestors,
                totalInvestment: totalInvestment,
                totalCommission: totalCommission,
                pendingCommission: 110 * activeInvestors // ₹110 per referral
            }
        });
        
    } catch (error) {
        console.error('Team stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 14. GET TEAM MEMBERS
app.get('/api/team-members/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const teamSnapshot = await db.ref(`teams/${userId}`).once('value');
        const teamMembers = teamSnapshot.val() || {};
        
        const membersArray = Object.values(teamMembers);
        
        res.json({ 
            success: true, 
            members: membersArray 
        });
        
    } catch (error) {
        console.error('Team members error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 15. GET INCOME STATS
app.get('/api/income-stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const today = new Date().toDateString();
        let todayIncome = 0;
        let totalIncome = 0;
        let referralIncome = 0;
        
        const txSnapshot = await db.ref(`transactions/${userId}`).once('value');
        const transactions = txSnapshot.val() || {};
        
        Object.values(transactions).forEach(tx => {
            if (tx.type === 'daily_income') {
                totalIncome += tx.amount || 0;
                
                const txDate = new Date(tx.date).toDateString();
                if (txDate === today) {
                    todayIncome += tx.amount || 0;
                }
            } else if (tx.type === 'referral_commission') {
                referralIncome += tx.amount || 0;
                totalIncome += tx.amount || 0;
            } else if (tx.type === 'gift_code' || tx.type === 'checkin') {
                totalIncome += tx.amount || 0;
            }
        });
        
        // Get locked balance from user data
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        const userData = userSnapshot.val();
        
        res.json({ 
            success: true, 
            todayIncome: todayIncome,
            totalIncome: totalIncome,
            referralIncome: referralIncome,
            lockedBalance: userData.lockedBalance || 0,
            regularBalance: userData.balance || 0
        });
        
    } catch (error) {
        console.error('Income stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 16. GET INCOME RECORDS
app.get('/api/income-records/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { type } = req.query;
        
        const txSnapshot = await db.ref(`transactions/${userId}`).once('value');
        const transactions = txSnapshot.val() || {};
        
        let filteredTransactions = Object.values(transactions).filter(tx => {
            if (type === 'daily') return tx.type === 'daily_income';
            if (type === 'commission') return tx.type === 'referral_commission';
            if (type === 'gift') return tx.type === 'gift_code' || tx.type === 'checkin';
            return true;
        });
        
        filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({ 
            success: true, 
            records: filteredTransactions 
        });
        
    } catch (error) {
        console.error('Income records error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 17. GET WITHDRAWAL HISTORY
app.get('/api/withdrawal-history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const withdrawalsSnapshot = await db.ref('withdrawals').orderByChild('userId').equalTo(userId).once('value');
        const withdrawals = withdrawalsSnapshot.val() || {};
        
        const withdrawalsArray = Object.values(withdrawals).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        
        res.json({ 
            success: true, 
            withdrawals: withdrawalsArray 
        });
        
    } catch (error) {
        console.error('Withdrawal history error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ==================== SECURE INCOME CHECK APIs (FIXED) ====================

// 35. SECURE INCOME CHECK (WITH CHEAT DETECTION) - FIXED VERSION
app.post('/api/secure-income-check', async (req, res) => {
    try {
        const { userId, clientTime } = req.body;
        const serverTime = Date.now();
        
        console.log(`💰 Secure income check for: ${userId}`);
        
        // Check if user is banned
        const isBanned = await checkIfBanned(userId);
        if (isBanned) {
            return res.status(403).json({
                success: false,
                message: 'Account suspended. Cannot check income.'
            });
        }
        
        // Check time difference (max 2 minutes allowed)
        const timeDifference = Math.abs(serverTime - clientTime);
        
        // 🚨 CHEAT DETECTION: Time manipulation
        if (timeDifference > 120000) { // 2 minutes
            console.log(`⚠️ Time manipulation detected: ${userId}`);
            
            // Record cheating attempt
            await db.ref(`cheatLogs/${userId}/${serverTime}`).set({
                serverTime: serverTime,
                clientTime: clientTime,
                difference: timeDifference,
                type: 'time_manipulation',
                detectedAt: new Date().toISOString()
            });
            
            // Increment cheat attempts
            const userRef = db.ref(`users/${userId}`);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val();
            
            const newCheatAttempts = (userData.cheatAttempts || 0) + 1;
            await userRef.update({
                cheatAttempts: newCheatAttempts
            });
            
            // 🚨 AUTOMATIC BAN after 3 cheat attempts
            if (newCheatAttempts >= 3) {
                await detectAndBanCheater(
                    userId, 
                    'Multiple cheat attempts detected',
                    {
                        attempts: newCheatAttempts,
                        lastDifference: timeDifference,
                        type: 'time_manipulation'
                    }
                );
                
                return res.json({
                    success: false,
                    message: 'Account banned due to multiple cheat attempts.',
                    banned: true
                });
            }
            
            // Penalty - delay next payout by 1 hour
            await db.ref(`penalties/${userId}`).set({
                lastPenalty: serverTime,
                nextCheckTime: serverTime + 3600000,
                reason: 'time_manipulation'
            });
            
            return res.json({
                success: false,
                message: 'Time manipulation detected! Next income delayed by 1 hour.',
                realTime: new Date(serverTime).toLocaleString(),
                yourTime: new Date(clientTime).toLocaleString(),
                penalty: '1_hour_delay',
                cheatAttempts: newCheatAttempts
            });
        }
        
        // Check if user is penalized
        const penaltySnap = await db.ref(`penalties/${userId}`).once('value');
        const penalty = penaltySnap.val();
        
        if (penalty && serverTime < penalty.nextCheckTime) {
            const remainingTime = penalty.nextCheckTime - serverTime;
            const remainingMinutes = Math.ceil(remainingTime / 60000);
            
            return res.json({
                success: false,
                message: `Please wait ${remainingMinutes} minutes before checking again.`,
                waitTime: remainingTime,
                reason: penalty.reason || 'penalty_applied'
            });
        }
        
        // Get user data FIRST (FIXED: Pehle hi user data fetch karo)
        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        let userData = userSnap.val() || {};
        
        // Get user investments
        const investmentsSnap = await db.ref(`investments/${userId}`).once('value');
        const investments = investmentsSnap.val() || {};
        
        let totalIncome = 0;
        let lockedIncome = 0;
        let regularIncome = 0;
        let processedInvestments = [];
        
        // Check each investment
        for (const invId in investments) {
            const investment = investments[invId];
            
            if (investment.status !== 'active') continue;
            if (investment.daysRemaining <= 0) continue;
            
            // Check if 24 hours have passed since last payout
            const lastPayout = investment.lastPayoutTime || investment.investmentTime;
            const hoursPassed = (serverTime - lastPayout) / (1000 * 60 * 60);
            
            if (hoursPassed >= 24) {
                const incomeToAdd = investment.dailyIncome;
                const plan = NEW_PLANS[investment.planId];
                
                // Update investment
                await db.ref(`investments/${userId}/${invId}`).update({
                    lastPayoutTime: serverTime,
                    nextPayoutTime: serverTime + (24 * 60 * 60 * 1000),
                    daysRemaining: investment.daysRemaining - 1,
                    totalEarned: (investment.totalEarned || 0) + incomeToAdd,
                    payoutCount: (investment.payoutCount || 0) + 1,
                    status: investment.daysRemaining - 1 <= 0 ? 'completed' : 'active'
                });
                
                totalIncome += incomeToAdd;
                
                if (plan && plan.lockedBalance) {
                    lockedIncome += incomeToAdd;
                } else {
                    regularIncome += incomeToAdd;
                }
                
                processedInvestments.push({
                    investmentId: invId,
                    planName: investment.planName,
                    amount: incomeToAdd,
                    type: plan?.lockedBalance ? 'locked' : 'regular'
                });
                
                // Record payout
                await db.ref(`payouts/${userId}/${invId}/${serverTime}`).set({
                    timestamp: serverTime,
                    amount: incomeToAdd,
                    investmentId: invId,
                    planName: investment.planName,
                    balanceType: plan?.lockedBalance ? 'locked' : 'regular'
                });
            }
        }
        
        // Update user balance if income added
        if (totalIncome > 0) {
            // Refresh user data for updates
            const updatedUserSnap = await userRef.once('value');
            userData = updatedUserSnap.val() || {};
            
            if (regularIncome > 0) {
                const newBalance = (userData.balance || 0) + regularIncome;
                await userRef.update({
                    balance: newBalance
                });
            }
            
            if (lockedIncome > 0) {
                const newLockedBalance = (userData.lockedBalance || 0) + lockedIncome;
                await userRef.update({
                    lockedBalance: newLockedBalance
                });
            }
            
            await userRef.update({
                totalEarnings: (userData.totalEarnings || 0) + totalIncome,
                lastIncomeCheck: serverTime
            });
            
            // Record transaction
            const transactionId = generateTransactionId();
            await db.ref(`transactions/${userId}/${transactionId}`).set({
                id: transactionId,
                type: 'daily_income',
                amount: totalIncome,
                regularIncome: regularIncome,
                lockedIncome: lockedIncome,
                timestamp: serverTime,
                date: new Date().toISOString(),
                investments: processedInvestments,
                status: 'completed',
                note: 'Daily income from investments'
            });
            
            // Update last successful check
            await db.ref(`lastChecks/${userId}`).set({
                lastCheck: serverTime,
                incomeAdded: totalIncome,
                regularIncome: regularIncome,
                lockedIncome: lockedIncome,
                investmentsCount: processedInvestments.length
            });
        }
        
        // Get next payout times for response
        const nextPayouts = [];
        for (const invId in investments) {
            const inv = investments[invId];
            if (inv.status === 'active') {
                const nextPayout = inv.nextPayoutTime || inv.investmentTime + (24 * 60 * 60 * 1000);
                const hoursUntilNext = Math.max(0, (nextPayout - serverTime) / (1000 * 60 * 60));
                
                const plan = NEW_PLANS[inv.planId];
                
                nextPayouts.push({
                    investmentId: invId,
                    planName: inv.planName,
                    nextPayoutTime: nextPayout,
                    hoursRemaining: Math.ceil(hoursUntilNext),
                    isEligible: hoursUntilNext <= 0,
                    balanceType: plan?.lockedBalance ? 'locked' : 'regular'
                });
            }
        }
        
        // Prepare response (FIXED: userData ab always defined hai)
        const response = {
            success: true,
            serverTime: serverTime,
            incomeAdded: totalIncome,
            regularIncome: regularIncome,
            lockedIncome: lockedIncome,
            nextCheckTime: serverTime + 3600000, // Can check again in 1 hour
            processedCount: processedInvestments.length,
            nextPayouts: nextPayouts,
            message: totalIncome > 0 
                ? `🎉 ₹${totalIncome} income added successfully! (₹${regularIncome} available, ₹${lockedIncome} locked)`
                : 'No income available yet. Check back later.',
            security: {
                cheatAttempts: userData.cheatAttempts || 0  // ✅ FIXED: userData always defined
            }
        };
        
        // Log this check
        await db.ref(`incomeChecks/${userId}/${serverTime}`).set({
            serverTime: serverTime,
            clientTime: clientTime,
            incomeAdded: totalIncome,
            regularIncome: regularIncome,
            lockedIncome: lockedIncome,
            processedInvestments: processedInvestments.length,
            ip: req.headers['x-forwarded-for'] || req.ip
        });
        
        res.json(response);
        
    } catch (error) {
        console.error('Secure income check error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});

// 36. GET NEXT INCOME TIME
app.post('/api/get-next-income', async (req, res) => {
    try {
        const { userId } = req.body;
        const serverTime = Date.now();
        
        // Check if user is banned
        const isBanned = await checkIfBanned(userId);
        if (isBanned) {
            return res.status(403).json({
                success: false,
                message: 'Account suspended.'
            });
        }
        
        // Get user investments
        const investmentsSnap = await db.ref(`investments/${userId}`).once('value');
        const investments = investmentsSnap.val() || {};
        
        const result = [];
        let earliestNextPayout = null;
        let totalDailyIncome = 0;
        let lockedDailyIncome = 0;
        let regularDailyIncome = 0;
        
        for (const invId in investments) {
            const inv = investments[invId];
            if (inv.status === 'active') {
                const plan = NEW_PLANS[inv.planId];
                const nextPayout = inv.nextPayoutTime || inv.investmentTime + (24 * 60 * 60 * 1000);
                const hoursRemaining = Math.max(0, (nextPayout - serverTime) / (1000 * 60 * 60));
                
                result.push({
                    planName: inv.planName,
                    nextPayout: new Date(nextPayout).toLocaleString(),
                    hoursRemaining: Math.ceil(hoursRemaining),
                    dailyIncome: inv.dailyIncome,
                    isEligible: hoursRemaining <= 0,
                    balanceType: plan?.lockedBalance ? 'locked' : 'regular'
                });
                
                totalDailyIncome += inv.dailyIncome;
                
                if (plan?.lockedBalance) {
                    lockedDailyIncome += inv.dailyIncome;
                } else {
                    regularDailyIncome += inv.dailyIncome;
                }
                
                // Track earliest next payout
                if (!earliestNextPayout || nextPayout < earliestNextPayout) {
                    earliestNextPayout = nextPayout;
                }
            }
        }
        
        res.json({
            success: true,
            serverTime: serverTime,
            investments: result,
            totalDailyIncome: totalDailyIncome,
            lockedDailyIncome: lockedDailyIncome,
            regularDailyIncome: regularDailyIncome,
            earliestNextPayout: earliestNextPayout ? new Date(earliestNextPayout).toLocaleString() : null,
            earliestHoursRemaining: earliestNextPayout ? Math.ceil((earliestNextPayout - serverTime) / (1000 * 60 * 60)) : null
        });
        
    } catch (error) {
        console.error('Get next income error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ==================== ADMIN APIs ====================

// 18. ADMIN LOGIN
app.post('/api/admin/login', checkAdmin, (req, res) => {
    res.json({ 
        success: true, 
        message: 'Admin login successful',
        token: 'admin-token'
    });
});

// 19. GET ALL USERS (Admin only)
app.get('/api/admin/users', checkAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('users').once('value');
        const users = snapshot.val() || {};
        
        Object.keys(users).forEach(key => {
            if (users[key].password) {
                delete users[key].password;
            }
        });
        
        res.json({ 
            success: true, 
            users: users 
        });
        
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 20. APPROVE RECHARGE (Admin only)
app.post('/api/admin/approve-recharge', checkAdmin, async (req, res) => {
    try {
        const { rechargeId, userId, amount } = req.body;
        
        if (!rechargeId || !userId || !amount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid request' 
            });
        }
        
        await db.ref(`recharges/${rechargeId}`).update({
            status: 'approved',
            approvedBy: 'admin',
            approvedAt: new Date().toISOString()
        });
        
        const userRef = db.ref(`users/${userId}`);
        const userSnapshot = await userRef.once('value');
        const userData = userSnapshot.val();
        
        const newBalance = (userData.balance || 0) + parseFloat(amount);
        const newRechargeBalance = (userData.rechargeBalance || 0) + parseFloat(amount);
        
        await userRef.update({
            balance: newBalance,
            rechargeBalance: newRechargeBalance,
            lastRechargeDate: new Date().toISOString(),
            totalRecharged: (userData.totalRecharged || 0) + parseFloat(amount)
        });
        
        const transactionId = generateTransactionId();
        await db.ref(`transactions/${userId}/${transactionId}`).set({
            id: transactionId,
            type: 'recharge',
            amount: amount,
            rechargeId: rechargeId,
            date: new Date().toISOString(),
            status: 'completed',
            note: 'Recharge approved by admin'
        });
        
        res.json({ 
            success: true, 
            message: 'Recharge approved successfully',
            newBalance: newBalance
        });
        
    } catch (error) {
        console.error('Approve recharge error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 21. PROCESS WITHDRAWAL (Admin only)
app.post('/api/admin/process-withdrawal', checkAdmin, async (req, res) => {
    try {
        console.log('🔧 Processing withdrawal request:', req.body);
        
        const { withdrawalId, status, utrNumber, transactionId } = req.body;
        
        if (!withdrawalId || !status) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid request' 
            });
        }
        
        const withdrawalRef = db.ref(`withdrawals/${withdrawalId}`);
        const withdrawalSnapshot = await withdrawalRef.once('value');
        
        console.log('📋 Withdrawal data found:', withdrawalSnapshot.exists());
        
        if (!withdrawalSnapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'Withdrawal not found' 
            });
        }
        
        const withdrawalData = withdrawalSnapshot.val();
        console.log('📄 Withdrawal data:', withdrawalData);
        
        const updateData = {
            status: status,
            processedBy: 'admin',
            processedAt: new Date().toISOString(),
            utrNumber: utrNumber || null,
            transactionId: transactionId || null
        };
        
        console.log('🔄 Updating withdrawal with:', updateData);
        
        await withdrawalRef.update(updateData);
        
        if (status === 'completed') {
            console.log('✅ Marking withdrawal as completed...');
            
            // Add to trust withdrawals for public view
            const trustWithdrawalData = {
                ...withdrawalData,
                ...updateData,
                displayName: withdrawalData.userName?.charAt(0) + "***" + withdrawalData.userName?.split(' ')[1]?.charAt(0) || "U***r",
                displayPhone: withdrawalData.userPhone ? 
                    withdrawalData.userPhone.slice(0, 3) + "****" + withdrawalData.userPhone.slice(7) : 
                    "9*******0",
                isDemo: false,
                type: 'real',
                completedDate: new Date().toISOString()
            };
            
            console.log('💾 Saving to trust withdrawals...');
            
            try {
                await db.ref(`trustWithdrawals/real/${withdrawalId}`).set(trustWithdrawalData);
                await db.ref(`trustWithdrawals/public/${withdrawalId}`).set(trustWithdrawalData);
                
                console.log('👤 Updating user data...');
                
                // Update user's successful withdrawals count
                if (withdrawalData.userId) {
                    const userRef = db.ref(`users/${withdrawalData.userId}`);
                    const userSnapshot = await userRef.once('value');
                    
                    if (userSnapshot.exists()) {
                        const userData = userSnapshot.val();
                        await userRef.update({
                            trustWithdrawalsCount: (userData.trustWithdrawalsCount || 0) + 1
                        });
                        
                        console.log('✅ User trust count updated');
                    }
                    
                    // Update transaction status
                    try {
                        const txRef = db.ref(`transactions/${withdrawalData.userId}`)
                            .orderByChild('type')
                            .equalTo('withdrawal_request');
                        
                        const txSnapshot = await txRef.once('value');
                        
                        if (txSnapshot.exists()) {
                            let foundTransactionKey = null;
                            let foundTransaction = null;
                            
                            txSnapshot.forEach((childSnapshot) => {
                                const tx = childSnapshot.val();
                                if (tx.withdrawalId === withdrawalId || 
                                    (tx.amount === withdrawalData.amount && 
                                     Math.abs(tx.amount - withdrawalData.amount) < 0.01)) {
                                    foundTransaction = tx;
                                    foundTransactionKey = childSnapshot.key;
                                    return true;
                                }
                            });
                            
                            if (foundTransaction && foundTransactionKey) {
                                await db.ref(`transactions/${withdrawalData.userId}/${foundTransactionKey}`).update({
                                    status: 'completed',
                                    utrNumber: utrNumber,
                                    transactionId: transactionId,
                                    completedDate: new Date().toISOString()
                                });
                                console.log('✅ Transaction updated successfully');
                            } else {
                                console.log('ℹ️ No matching transaction found');
                            }
                        }
                    } catch (txError) {
                        console.log('⚠️ Transaction update skipped:', txError.message);
                    }
                }
            } catch (trustError) {
                console.log('⚠️ Trust withdrawal saving skipped:', trustError.message);
            }
            
        } else if (status === 'rejected') {
            console.log('❌ Withdrawal rejected, refunding balance...');
            
            if (withdrawalData.userId) {
                const userRef = db.ref(`users/${withdrawalData.userId}`);
                const userSnapshot = await userRef.once('value');
                
                if (userSnapshot.exists()) {
                    const userData = userSnapshot.val();
                    const newBalance = (userData.balance || 0) + withdrawalData.amount;
                    await userRef.update({
                        balance: newBalance,
                        withdrawn: (userData.withdrawn || 0) - withdrawalData.amount
                    });
                    console.log('💰 Balance refunded');
                }
            }
        }
        
        console.log('🎉 Withdrawal processed successfully!');
        
        res.json({ 
            success: true, 
            message: `Withdrawal ${status} successfully`,
            withdrawalId: withdrawalId
        });
        
    } catch (error) {
        console.error('❌ Process withdrawal error:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Request body:', req.body);
        
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 22. GET PENDING RECHARGES (Admin only)
app.get('/api/admin/pending-recharges', checkAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('recharges').orderByChild('status').equalTo('pending').once('value');
        const recharges = snapshot.val() || {};
        
        res.json({ 
            success: true, 
            recharges: recharges 
        });
        
    } catch (error) {
        console.error('Pending recharges error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 23. GET PENDING WITHDRAWALS (Admin only)
app.get('/api/admin/pending-withdrawals', checkAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('withdrawals').orderByChild('status').equalTo('pending').once('value');
        const withdrawals = snapshot.val() || {};
        
        res.json({ 
            success: true, 
            withdrawals: withdrawals 
        });
        
    } catch (error) {
        console.error('Pending withdrawals error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 24. MANUAL DAILY INCOME DISTRIBUTION (Admin only)
app.post('/api/admin/distribute-daily-income', checkAdmin, async (req, res) => {
    try {
        console.log('💰 Admin triggered manual daily income distribution');
        
        // Get all active users
        const usersSnapshot = await db.ref('users').once('value');
        const users = usersSnapshot.val() || {};
        
        let totalDistributed = 0;
        let usersProcessed = 0;
        
        for (const userId in users) {
            try {
                // Get user investments
                const investmentsSnap = await db.ref(`investments/${userId}`).once('value');
                const investments = investmentsSnap.val() || {};
                
                let userIncome = 0;
                let userLockedIncome = 0;
                let userRegularIncome = 0;
                
                for (const invId in investments) {
                    const investment = investments[invId];
                    
                    if (investment.status !== 'active') continue;
                    if (investment.daysRemaining <= 0) continue;
                    
                    // Check if 24 hours have passed
                    const lastPayout = investment.lastPayoutTime || investment.investmentTime;
                    const hoursPassed = (Date.now() - lastPayout) / (1000 * 60 * 60);
                    
                    if (hoursPassed >= 24) {
                        const incomeToAdd = investment.dailyIncome;
                        const plan = NEW_PLANS[investment.planId];
                        
                        // Update investment
                        await db.ref(`investments/${userId}/${invId}`).update({
                            lastPayoutTime: Date.now(),
                            nextPayoutTime: Date.now() + (24 * 60 * 60 * 1000),
                            daysRemaining: investment.daysRemaining - 1,
                            totalEarned: (investment.totalEarned || 0) + incomeToAdd,
                            payoutCount: (investment.payoutCount || 0) + 1,
                            status: investment.daysRemaining - 1 <= 0 ? 'completed' : 'active'
                        });
                        
                        userIncome += incomeToAdd;
                        
                        if (plan?.lockedBalance) {
                            userLockedIncome += incomeToAdd;
                        } else {
                            userRegularIncome += incomeToAdd;
                        }
                    }
                }
                
                // Update user balance if income added
                if (userIncome > 0) {
                    const userRef = db.ref(`users/${userId}`);
                    const userSnap = await userRef.once('value');
                    const userData = userSnap.val();
                    
                    if (userRegularIncome > 0) {
                        await userRef.update({
                            balance: (userData.balance || 0) + userRegularIncome
                        });
                    }
                    
                    if (userLockedIncome > 0) {
                        await userRef.update({
                            lockedBalance: (userData.lockedBalance || 0) + userLockedIncome
                        });
                    }
                    
                    await userRef.update({
                        totalEarnings: (userData.totalEarnings || 0) + userIncome,
                        lastIncomeCheck: Date.now()
                    });
                    
                    // Record transaction
                    const transactionId = generateTransactionId();
                    await db.ref(`transactions/${userId}/${transactionId}`).set({
                        id: transactionId,
                        type: 'daily_income',
                        amount: userIncome,
                        regularIncome: userRegularIncome,
                        lockedIncome: userLockedIncome,
                        timestamp: Date.now(),
                        date: new Date().toISOString(),
                        status: 'completed',
                        note: 'Manual daily income distribution by admin'
                    });
                    
                    totalDistributed += userIncome;
                    usersProcessed++;
                }
            } catch (userError) {
                console.error(`Error processing user ${userId}:`, userError);
            }
        }
        
        res.json({
            success: true,
            message: 'Daily income distributed successfully',
            result: {
                totalDistributed: totalDistributed,
                usersProcessed: usersProcessed,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Manual distribution error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error distributing income' 
        });
    }
});

// 25. GET REFERRAL STATS (Admin only)
app.get('/api/admin/referral-stats', checkAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('users').once('value');
        const users = snapshot.val() || {};
        
        let stats = {
            totalUsers: Object.keys(users).length,
            totalReferrals: 0,
            totalCommissionPaid: 0,
            totalInvestmentFromReferrals: 0,
            usersWithReferrals: 0,
            topReferrers: []
        };
        
        Object.values(users).forEach(user => {
            if (user.referrals && user.referrals.length > 0) {
                stats.usersWithReferrals++;
                stats.totalReferrals += user.referrals.length;
                
                let totalCommission = 0;
                let totalInvestment = 0;
                
                user.referrals.forEach(ref => {
                    totalCommission += ref.commissionEarned || 0;
                    totalInvestment += ref.totalInvested || 0;
                });
                
                stats.totalCommissionPaid += totalCommission;
                stats.totalInvestmentFromReferrals += totalInvestment;
                
                stats.topReferrers.push({
                    name: user.name,
                    phone: user.phone,
                    referrals: user.referrals.length,
                    totalCommission: totalCommission,
                    totalInvestment: totalInvestment
                });
            }
        });
        
        stats.topReferrers.sort((a, b) => b.totalCommission - a.totalCommission);
        stats.topReferrers = stats.topReferrers.slice(0, 10);
        
        res.json({
            success: true,
            stats: stats
        });
        
    } catch (error) {
        console.error('Referral stats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
});

// ==================== ADMIN BAN SYSTEM ====================

// 37. ADMIN: BAN USER
app.post('/api/admin/ban-user', checkAdmin, async (req, res) => {
    try {
        const { userId, reason, durationDays } = req.body;
        
        if (!userId || !reason) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID and reason required' 
            });
        }
        
        // Check if user exists
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const banId = generateBanId();
        const expiresAt = durationDays ? 
            new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString() : 
            null;
        
        const banData = {
            id: banId,
            userId: userId,
            userName: userSnapshot.val().name,
            userPhone: userSnapshot.val().phone,
            reason: reason,
            details: req.body.details || null,
            bannedAt: new Date().toISOString(),
            bannedBy: 'admin',
            status: 'active',
            expiresAt: expiresAt,
            durationDays: durationDays || null
        };
        
        // Save ban record
        await db.ref(`bans/${userId}`).set(banData);
        
        // Update user status
        await db.ref(`users/${userId}`).update({
            status: 'banned',
            banReason: reason,
            bannedAt: new Date().toISOString()
        });
        
        console.log(`🔨 ADMIN BANNED USER: ${userId} - ${reason}`);
        
        res.json({ 
            success: true, 
            message: 'User banned successfully',
            banId: banId,
            user: {
                id: userId,
                name: userSnapshot.val().name,
                phone: userSnapshot.val().phone
            }
        });
        
    } catch (error) {
        console.error('Admin ban error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 38. ADMIN: UNBAN USER
app.post('/api/admin/unban-user', checkAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID required' 
            });
        }
        
        // Remove ban record
        await db.ref(`bans/${userId}`).remove();
        
        // Update user status
        await db.ref(`users/${userId}`).update({
            status: 'active',
            banReason: null,
            bannedAt: null
        });
        
        console.log(`🔓 ADMIN UNBANNED USER: ${userId}`);
        
        res.json({ 
            success: true, 
            message: 'User unbanned successfully'
        });
        
    } catch (error) {
        console.error('Admin unban error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 39. ADMIN: GET BANNED USERS
app.get('/api/admin/banned-users', checkAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('bans').once('value');
        const bans = snapshot.val() || {};
        
        const bannedUsers = [];
        
        for (const userId in bans) {
            const ban = bans[userId];
            const userSnapshot = await db.ref(`users/${userId}`).once('value');
            const user = userSnapshot.val();
            
            if (user) {
                bannedUsers.push({
                    userId: userId,
                    userName: user.name,
                    userPhone: user.phone,
                    banReason: ban.reason,
                    bannedAt: ban.bannedAt,
                    bannedBy: ban.bannedBy,
                    expiresAt: ban.expiresAt,
                    status: ban.status,
                    details: ban.details
                });
            }
        }
        
        bannedUsers.sort((a, b) => new Date(b.bannedAt) - new Date(a.bannedAt));
        
        res.json({ 
            success: true, 
            bannedUsers: bannedUsers,
            total: bannedUsers.length
        });
        
    } catch (error) {
        console.error('Get banned users error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 40. ADMIN: GET CHEAT LOGS
app.get('/api/admin/cheat-logs', checkAdmin, async (req, res) => {
    try {
        const { userId, limit = 50 } = req.query;
        
        let cheatLogs = [];
        
        if (userId) {
            const snapshot = await db.ref(`cheatLogs/${userId}`)
                .orderByKey()
                .limitToLast(parseInt(limit))
                .once('value');
            
            if (snapshot.exists()) {
                const logs = snapshot.val();
                for (const timestamp in logs) {
                    cheatLogs.push({
                        userId: userId,
                        timestamp: parseInt(timestamp),
                        ...logs[timestamp]
                    });
                }
            }
        } else {
            const snapshot = await db.ref('cheatLogs').once('value');
            const allLogs = snapshot.val() || {};
            
            for (const uid in allLogs) {
                const userLogs = allLogs[uid];
                for (const timestamp in userLogs) {
                    cheatLogs.push({
                        userId: uid,
                        timestamp: parseInt(timestamp),
                        ...userLogs[timestamp]
                    });
                }
            }
        }
        
        cheatLogs.sort((a, b) => b.timestamp - a.timestamp);
        cheatLogs = cheatLogs.slice(0, parseInt(limit));
        
        res.json({ 
            success: true, 
            cheatLogs: cheatLogs,
            total: cheatLogs.length
        });
        
    } catch (error) {
        console.error('Get cheat logs error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ==================== TRUST SYSTEM APIs ====================

// 41. GET TRUST WITHDRAWALS (Public)
app.get('/api/trust/withdrawals', async (req, res) => {
    try {
        const { limit = 50, type = 'all' } = req.query;
        const limitNum = parseInt(limit);
        
        let withdrawals = [];
        
        // Get from public withdrawals
        const publicSnapshot = await db.ref('trustWithdrawals/public')
            .orderByChild('date')
            .limitToLast(limitNum)
            .once('value');
        
        if (publicSnapshot.exists()) {
            const publicData = publicSnapshot.val();
            withdrawals = Object.values(publicData);
        }
        
        // Sort by date (newest first)
        withdrawals.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Limit results
        withdrawals = withdrawals.slice(0, limitNum);
        
        res.json({ 
            success: true, 
            withdrawals: withdrawals,
            total: withdrawals.length,
            message: 'Withdrawals loaded successfully'
        });
        
    } catch (error) {
        console.error('Trust withdrawals error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 42. GET WITHDRAWAL STATS FOR TRUST PAGE
app.get('/api/trust/stats', async (req, res) => {
    try {
        const publicSnapshot = await db.ref('trustWithdrawals/public').once('value');
        const publicWithdrawals = publicSnapshot.val() || {};
        
        let stats = {
            totalWithdrawals: Object.keys(publicWithdrawals).length,
            totalAmount: 0,
            todayWithdrawals: 0,
            todayAmount: 0,
            realWithdrawals: 0,
            demoWithdrawals: 0,
            latestWithdrawals: []
        };
        
        const today = new Date().toDateString();
        const withdrawalsArray = Object.values(publicWithdrawals);
        
        withdrawalsArray.forEach(wd => {
            stats.totalAmount += wd.amount || 0;
            
            if (wd.type === 'real') {
                stats.realWithdrawals++;
            } else if (wd.type === 'demo') {
                stats.demoWithdrawals++;
            }
            
            const wdDate = new Date(wd.date).toDateString();
            if (wdDate === today) {
                stats.todayWithdrawals++;
                stats.todayAmount += wd.amount || 0;
            }
        });
        
        // Get latest 5 withdrawals
        stats.latestWithdrawals = withdrawalsArray
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        
        res.json({ 
            success: true, 
            stats: stats,
            message: 'Withdrawal statistics loaded'
        });
        
    } catch (error) {
        console.error('Withdrawal stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 43. ADMIN: CREATE FAKE/DEMO WITHDRAWAL
app.post('/api/admin/create-fake-withdrawal', checkAdmin, async (req, res) => {
    try {
        const { 
            userName, 
            amount, 
            bankName, 
            showAsReal = false,
            note = 'Admin created withdrawal'
        } = req.body;
        
        if (!userName || !amount || !bankName) {
            return res.status(400).json({ 
                success: false, 
                message: 'Required: userName, amount, bankName' 
            });
        }
        
        const withdrawalId = `fake_wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fakePhone = `9${Math.floor(Math.random() * 900000000) + 100000000}`;
        
        const fakeWithdrawal = {
            id: withdrawalId,
            userId: `fake_user_${Date.now()}`,
            userName: userName,
            userPhone: fakePhone,
            amount: parseFloat(amount),
            bankDetails: {
                bankName: bankName,
                accountNumber: `XXXXXX${Math.floor(1000 + Math.random() * 9000)}`,
                ifscCode: `${bankName.substring(0, 4).toUpperCase()}000${Math.floor(1000 + Math.random() * 9000)}`,
                accountHolder: userName
            },
            date: new Date().toISOString(),
            completedDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            status: 'completed',
            processedBy: 'admin',
            processedAt: new Date().toISOString(),
            isDemo: !showAsReal,
            note: note,
            transactionId: `TXN${Math.floor(10000000 + Math.random() * 90000000)}`,
            utrNumber: `UTR${Math.floor(100000000000 + Math.random() * 900000000000)}`,
            displayName: userName.charAt(0) + "***" + userName.split(' ')[1]?.charAt(0),
            displayPhone: fakePhone.slice(0, 3) + "****" + fakePhone.slice(7),
            type: showAsReal ? 'real' : 'demo'
        };
        
        // Save to appropriate location
        if (showAsReal) {
            await db.ref(`trustWithdrawals/real/${withdrawalId}`).set(fakeWithdrawal);
        } else {
            await db.ref(`trustWithdrawals/demo/${withdrawalId}`).set(fakeWithdrawal);
        }
        
        // Always add to public withdrawals
        await db.ref(`trustWithdrawals/public/${withdrawalId}`).set(fakeWithdrawal);
        
        res.json({ 
            success: true, 
            message: showAsReal ? 'Fake withdrawal created as real' : 'Demo withdrawal created',
            withdrawalId: withdrawalId,
            withdrawal: fakeWithdrawal
        });
        
    } catch (error) {
        console.error('Create fake withdrawal error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 44. ADMIN: GET ALL TRUST WITHDRAWALS
app.get('/api/admin/trust-withdrawals', checkAdmin, async (req, res) => {
    try {
        const { type = 'all' } = req.query;
        
        let withdrawals = {};
        
        if (type === 'demo') {
            const snapshot = await db.ref('trustWithdrawals/demo').once('value');
            withdrawals = snapshot.val() || {};
        } else if (type === 'real') {
            const snapshot = await db.ref('trustWithdrawals/real').once('value');
            withdrawals = snapshot.val() || {};
        } else if (type === 'public') {
            const snapshot = await db.ref('trustWithdrawals/public').once('value');
            withdrawals = snapshot.val() || {};
        } else {
            // Get all
            const demoSnapshot = await db.ref('trustWithdrawals/demo').once('value');
            const realSnapshot = await db.ref('trustWithdrawals/real').once('value');
            
            const demoData = demoSnapshot.val() || {};
            const realData = realSnapshot.val() || {};
            
            withdrawals = { ...demoData, ...realData };
        }
        
        const withdrawalsArray = Object.values(withdrawals);
        withdrawalsArray.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({ 
            success: true, 
            withdrawals: withdrawalsArray,
            total: withdrawalsArray.length,
            type: type
        });
        
    } catch (error) {
        console.error('Admin get trust withdrawals error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 45. ADMIN: BULK CREATE DEMO WITHDRAWALS
app.post('/api/admin/bulk-demo-withdrawals', checkAdmin, async (req, res) => {
    try {
        const { count = 20 } = req.body;
        
        const result = await generateDemoWithdrawals();
        
        res.json({ 
            success: true, 
            message: `Created ${result.length} demo withdrawals`,
            count: result.length
        });
        
    } catch (error) {
        console.error('Bulk demo error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 46. ADMIN: GENERATE GIFT CODE
app.post('/api/admin/generate-gift-code', checkAdmin, async (req, res) => {
    try {
        const { amount, expiryDays, maxUses = 1, createdFor, note } = req.body;
        
        if (!amount || amount < 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum gift code amount is ₹10' 
            });
        }
        
        const giftCode = generateGiftCode();
        
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (expiryDays || 30));
        
        const giftCodeData = {
            code: giftCode,
            amount: parseFloat(amount),
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
            expiryDate: expiryDate.toISOString(),
            status: 'active',
            maxUses: maxUses,
            usedCount: 0,
            usedBy: [],
            createdFor: createdFor || null,
            note: note || 'Admin generated gift code'
        };
        
        await db.ref(`giftCodes/${giftCode}`).set(giftCodeData);
        
        res.json({ 
            success: true, 
            message: 'Gift code generated successfully',
            giftCode: giftCode,
            data: giftCodeData
        });
        
    } catch (error) {
        console.error('Generate gift code error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 47. ADMIN: GET ALL GIFT CODES
app.get('/api/admin/gift-codes', checkAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('giftCodes').once('value');
        const giftCodes = snapshot.val() || {};
        
        res.json({ 
            success: true, 
            giftCodes: giftCodes 
        });
        
    } catch (error) {
        console.error('Get gift codes error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 48. USER: CHECK GIFT CODE VALIDITY
app.post('/api/check-gift-code', async (req, res) => {
    try {
        const { giftCode } = req.body;
        
        if (!giftCode) {
            return res.json({ 
                success: false, 
                message: 'Gift code required' 
            });
        }
        
        const snapshot = await db.ref(`giftCodes/${giftCode}`).once('value');
        if (!snapshot.exists()) {
            return res.json({ 
                success: false, 
                message: 'Invalid gift code' 
            });
        }
        
        const codeData = snapshot.val();
        
        if (new Date(codeData.expiryDate) < new Date()) {
            return res.json({ 
                success: false, 
                message: 'Gift code expired' 
            });
        }
        
        if (codeData.usedCount >= codeData.maxUses) {
            return res.json({ 
                success: false, 
                message: 'Gift code already used' 
            });
        }
        
        if (codeData.status !== 'active') {
            return res.json({ 
                success: false, 
                message: 'Gift code is not active' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Gift code is valid',
            amount: codeData.amount,
            expires: codeData.expiryDate
        });
        
    } catch (error) {
        console.error('Check gift code error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 49. ADMIN: DELETE TRUST WITHDRAWAL
app.delete('/api/admin/trust-withdrawal/:withdrawalId', checkAdmin, async (req, res) => {
    try {
        const { withdrawalId } = req.params;
        
        await db.ref(`trustWithdrawals/demo/${withdrawalId}`).remove();
        await db.ref(`trustWithdrawals/real/${withdrawalId}`).remove();
        await db.ref(`trustWithdrawals/public/${withdrawalId}`).remove();
        
        res.json({ 
            success: true, 
            message: 'Trust withdrawal deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete trust withdrawal error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// 50. HEALTH CHECK
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Happy Invest API is running',
        timestamp: new Date().toISOString(),
        version: '5.0.1', // Version update kiya
        features: [
            'secure-income-system',
            'anti-cheat-protection',
            'admin-ban-system',
            'daily-withdrawal-limit',
            'locked-balance-vip-rich-ultimate',
            'fixed-110-referral',
            'trust-withdrawal-system',
            'bug-fixes' // New feature added
        ],
        plans: {
            basic: 3,
            vip: 3,
            rich: 4,
            ultimate: 3
        }
    });
});

// ==================== ERROR HANDLING ====================
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'API endpoint not found' 
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Happy Invest API v5.0.1 running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ Total APIs: 50 endpoints`);
    console.log(`✅ Rate Limiting: 60 requests/minute`);
    console.log(`✅ Anti-Cheat System: Enabled (3 attempts = ban)`);
    console.log(`✅ Admin Ban System: Enabled`);
    console.log(`✅ Withdrawal Rules: ₹200 min, 1 per day`);
    console.log(`✅ Referral System: Fixed ₹110 per referral`);
    console.log(`✅ Locked Balance: VIP/Rich/Ultimate plans`);
    console.log(`✅ Bug Fixes: userData error fixed in secure-income-check`);
    console.log(`✅ Health Check: http://localhost:${PORT}/api/health`);
    
    // Initialize demo withdrawals
    initializeDemoWithdrawals();
});

module.exports = app;