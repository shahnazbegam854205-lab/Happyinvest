const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');

const app = express();
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

// Password hashing functions
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

const verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

// ==================== ADMIN MIDDLEWARE ====================
const checkAdmin = (req, res, next) => {
    const adminPassword = req.headers['admin-password'] || req.body.adminPassword;
    const correctPassword = process.env.ADMIN_PASSWORD || 'happy@527876';
    
    if (adminPassword === correctPassword) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};

// ==================== DAILY INCOME CRON JOB ====================
const startDailyIncomeScheduler = () => {
    // Har din subah 9:00 AM pe daily income distribute kare
    cron.schedule('0 9 * * *', async () => {
        console.log('🔄 Auto: Starting daily income distribution...');
        await distributeDailyIncome();
    });
    
    console.log('✅ Daily income scheduler started (9:00 AM daily)');
};

// ==================== NEW INVESTMENT PLANS WITH INCREASING DAYS ====================
// Daily Income Formula: Investment Amount का 24.5% daily
// Days Formula: 200 = 9 days, 500 = 12 days, 1000 = 15 days, badhte jaaye
const NEW_PLANS = {
    // BASIC PLANS (200 से 5000 तक) - 9 से 21 दिन तक
    "basic_200": {
        id: "basic_200",
        name: "Basic 200",
        price: 200,
        currency: "₹",
        duration: 9, // Base: 9 days
        dailyIncome: 49, // 200 * 24.5% = 49
        totalIncome: 441, // 49 * 9 = 441
        type: "basic",
        category: "basic",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 120.5,
        commissionRate: 0.187
    },
    "basic_500": {
        id: "basic_500",
        name: "Basic 500",
        price: 500,
        currency: "₹",
        duration: 12, // 9 + 3 = 12 days
        dailyIncome: 122.5, // 500 * 24.5% = 122.5
        totalIncome: 1470, // 122.5 * 12 = 1470
        type: "basic",
        category: "basic",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 194,
        commissionRate: 0.187
    },
    "basic_1000": {
        id: "basic_1000",
        name: "Basic 1000",
        price: 1000,
        currency: "₹",
        duration: 15, // 12 + 3 = 15 days
        dailyIncome: 245, // 1000 * 24.5% = 245
        totalIncome: 3675, // 245 * 15 = 3675
        type: "basic",
        category: "basic",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 267.5,
        commissionRate: 0.187
    },
    "basic_2000": {
        id: "basic_2000",
        name: "Basic 2000",
        price: 2000,
        currency: "₹",
        duration: 18, // 15 + 3 = 18 days
        dailyIncome: 490, // 2000 * 24.5% = 490
        totalIncome: 8820, // 490 * 18 = 8820
        type: "basic",
        category: "basic",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 341,
        commissionRate: 0.187
    },
    "basic_5000": {
        id: "basic_5000",
        name: "Basic 5000",
        price: 5000,
        currency: "₹",
        duration: 21, // 18 + 3 = 21 days
        dailyIncome: 1225, // 5000 * 24.5% = 1225
        totalIncome: 25725, // 1225 * 21 = 25725
        type: "basic",
        category: "basic",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 414.5,
        commissionRate: 0.187
    },
    
    // VIP PLANS (25000 से 100000 तक) - 24 से 36 दिन तक
    "vip_25000": {
        id: "vip_25000",
        name: "VIP 25000",
        price: 25000,
        currency: "₹",
        duration: 24, // 21 + 3 = 24 days
        dailyIncome: 6125, // 25000 * 24.5% = 6125
        totalIncome: 147000, // 6125 * 24 = 147000
        type: "vip",
        category: "vip",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 488,
        commissionRate: 0.20
    },
    "vip_50000": {
        id: "vip_50000",
        name: "VIP 50000",
        price: 50000,
        currency: "₹",
        duration: 27, // 24 + 3 = 27 days
        dailyIncome: 12250, // 50000 * 24.5% = 12250
        totalIncome: 330750, // 12250 * 27 = 330750
        type: "vip",
        category: "vip",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 561.5,
        commissionRate: 0.20
    },
    "vip_75000": {
        id: "vip_75000",
        name: "VIP 75000",
        price: 75000,
        currency: "₹",
        duration: 30, // 27 + 3 = 30 days
        dailyIncome: 18375, // 75000 * 24.5% = 18375
        totalIncome: 551250, // 18375 * 30 = 551250
        type: "vip",
        category: "vip",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 635,
        commissionRate: 0.20
    },
    "vip_100000": {
        id: "vip_100000",
        name: "VIP 100000",
        price: 100000,
        currency: "₹",
        duration: 33, // 30 + 3 = 33 days
        dailyIncome: 24500, // 100000 * 24.5% = 24500
        totalIncome: 808500, // 24500 * 33 = 808500
        type: "vip",
        category: "vip",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 708.5,
        commissionRate: 0.20
    },
    
    // RICH PLANS (25000 से 100000 तक) - 36 से 48 दिन तक
    "rich_25000": {
        id: "rich_25000",
        name: "Rich 25000",
        price: 25000,
        currency: "₹",
        duration: 36, // 33 + 3 = 36 days
        dailyIncome: 6125, // 25000 * 24.5% = 6125
        totalIncome: 220500, // 6125 * 36 = 220500
        type: "rich",
        category: "rich",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 782,
        commissionRate: 0.25
    },
    "rich_50000": {
        id: "rich_50000",
        name: "Rich 50000",
        price: 50000,
        currency: "₹",
        duration: 39, // 36 + 3 = 39 days
        dailyIncome: 12250, // 50000 * 24.5% = 12250
        totalIncome: 477750, // 12250 * 39 = 477750
        type: "rich",
        category: "rich",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 855.5,
        commissionRate: 0.25
    },
    "rich_75000": {
        id: "rich_75000",
        name: "Rich 75000",
        price: 75000,
        currency: "₹",
        duration: 42, // 39 + 3 = 42 days
        dailyIncome: 18375, // 75000 * 24.5% = 18375
        totalIncome: 771750, // 18375 * 42 = 771750
        type: "rich",
        category: "rich",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 929,
        commissionRate: 0.25
    },
    "rich_100000": {
        id: "rich_100000",
        name: "Rich 100000",
        price: 100000,
        currency: "₹",
        duration: 45, // 42 + 3 = 45 days
        dailyIncome: 24500, // 100000 * 24.5% = 24500
        totalIncome: 1102500, // 24500 * 45 = 1102500
        type: "rich",
        category: "rich",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 1002.5,
        commissionRate: 0.25
    },
    
    // ULTIMATE PLANS (150000 से 500000 तक) - 48+ दिन
    "ultimate_150000": {
        id: "ultimate_150000",
        name: "Ultimate 150000",
        price: 150000,
        currency: "₹",
        duration: 48, // 45 + 3 = 48 days
        dailyIncome: 36750, // 150000 * 24.5% = 36750
        totalIncome: 1764000, // 36750 * 48 = 1764000
        type: "ultimate",
        category: "ultimate",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 1076,
        commissionRate: 0.30
    },
    "ultimate_250000": {
        id: "ultimate_250000",
        name: "Ultimate 250000",
        price: 250000,
        currency: "₹",
        duration: 51, // 48 + 3 = 51 days
        dailyIncome: 61250, // 250000 * 24.5% = 61250
        totalIncome: 3123750, // 61250 * 51 = 3123750
        type: "ultimate",
        category: "ultimate",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 1149.5,
        commissionRate: 0.30
    },
    "ultimate_500000": {
        id: "ultimate_500000",
        name: "Ultimate 500000",
        price: 500000,
        currency: "₹",
        duration: 54, // 51 + 3 = 54 days
        dailyIncome: 122500, // 500000 * 24.5% = 122500
        totalIncome: 6615000, // 122500 * 54 = 6615000
        type: "ultimate",
        category: "ultimate",
        dailyReturnPercent: 24.5,
        totalReturnPercent: 1223,
        commissionRate: 0.30
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
        
        // Check if phone already exists
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('phone').equalTo(phone).once('value');
        
        if (snapshot.exists()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number already registered' 
            });
        }
        
        // Generate user ID and referral code
        const userId = generateUserId();
        const userReferralCode = generateReferralCode();
        
        // Hash password
        const hashedPassword = await hashPassword(password);
        
        // Create user data
        const userData = {
            id: userId,
            name: name.trim(),
            phone: phone,
            password: hashedPassword,
            referralCode: userReferralCode,
            referredBy: referralCode || null,
            referredByCode: referralCode || null,
            balance: 0,
            rechargeBalance: 0,
            withdrawn: 0,
            totalEarnings: 0,
            totalCommission: 0,
            joinDate: new Date().toISOString(),
            status: 'active',
            level: 1,
            teamCount: 0,
            referralEarnings: 0,
            referralLink: `https://growdays/register?ref=${userReferralCode}`,
            bankDetails: null,
            dailyCheckin: {
                lastCheckin: null,
                streak: 0
            },
            referrals: [],
            hasInvested: false,
            firstInvestmentDate: null,
            totalInvestment: 0,
            totalRecharged: 0
        };
        
        // Save user to Firebase
        await db.ref(`users/${userId}`).set(userData);
        
        // Handle referral if exists
        if (referralCode) {
            try {
                const referrerSnapshot = await usersRef.orderByChild('referralCode').equalTo(referralCode).once('value');
                
                if (referrerSnapshot.exists()) {
                    referrerSnapshot.forEach(async (childSnapshot) => {
                        const referrerId = childSnapshot.key;
                        const referrerData = childSnapshot.val();
                        
                        // Update referrer's team count
                        const newTeamCount = (referrerData.teamCount || 0) + 1;
                        
                        // Add referral to referrer's list
                        const newReferrals = [...(referrerData.referrals || []), {
                            userId: userId,
                            name: name,
                            phone: phone,
                            joinDate: new Date().toISOString(),
                            hasInvested: false,
                            totalInvested: 0,
                            commissionEarned: 0
                        }];
                        
                        await db.ref(`users/${referrerId}`).update({
                            teamCount: newTeamCount,
                            referrals: newReferrals
                        });
                        
                        // Add to referrer's team
                        await db.ref(`teams/${referrerId}/${userId}`).set({
                            userId: userId,
                            name: name,
                            phone: phone,
                            joinDate: new Date().toISOString(),
                            level: 1,
                            hasInvested: false,
                            totalInvested: 0,
                            commissionPaid: 0
                        });
                        
                        console.log(`✅ Added ${name} to referrer ${referrerData.name}'s team`);
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

// 2. USER LOGIN
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
        
        let user = null;
        let isValid = false;
        
        snapshot.forEach(async (childSnapshot) => {
            const userData = childSnapshot.val();
            isValid = await verifyPassword(password, userData.password);
            
            if (isValid) {
                user = {
                    id: childSnapshot.key,
                    ...userData
                };
                delete user.password;
            }
        });
        
        if (user && isValid) {
            res.json({ 
                success: true, 
                message: 'Login successful',
                user: user
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
        
        // Check if user exists
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Create recharge request with pending status
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
        
        // Save recharge request
        await db.ref(`recharges/${rechargeId}`).set(rechargeData);
        
        res.json({ 
            success: true, 
            message: 'Recharge request submitted successfully. Waiting for admin approval.',
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

// 6. INVEST IN PLAN
app.post('/api/invest', async (req, res) => {
    try {
        const { userId, planId } = req.body;
        
        if (!userId || !planId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID and Plan ID required' 
            });
        }
        
        // Get plan details
        const plan = NEW_PLANS[planId];
        
        if (!plan) {
            return res.status(404).json({ 
                success: false, 
                message: 'Plan not found' 
            });
        }
        
        // Get user data
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const userData = userSnapshot.val();
        
        // Check if user has sufficient balance
        if (userData.balance < plan.price) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient balance' 
            });
        }
        
        // Deduct balance
        const newBalance = userData.balance - plan.price;
        await db.ref(`users/${userId}`).update({
            balance: newBalance,
            totalInvestment: (userData.totalInvestment || 0) + plan.price,
            hasInvested: true,
            firstInvestmentDate: userData.firstInvestmentDate || new Date().toISOString(),
            lastInvestmentDate: new Date().toISOString()
        });
        
        // Create investment
        const investmentId = generateInvestmentId();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.duration);
        
        const investmentData = {
            id: investmentId,
            userId: userId,
            planId: planId,
            planName: plan.name,
            amount: plan.price,
            dailyIncome: plan.dailyIncome,
            totalIncome: plan.totalIncome,
            startDate: new Date().toISOString(),
            endDate: endDate.toISOString(),
            status: 'active',
            daysRemaining: plan.duration,
            totalEarned: 0,
            nextPayoutDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            payoutCount: 0,
            expectedTotal: plan.totalIncome,
            isActive: true,
            lastUpdated: new Date().toISOString(),
            commissionRate: plan.commissionRate || 0.187,
            dailyReturnPercent: plan.dailyReturnPercent,
            totalReturnPercent: plan.totalReturnPercent,
            category: plan.category
        };
        
        await db.ref(`investments/${userId}/${investmentId}`).set(investmentData);
        
        // Create transaction record
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
        
        // ✅ REFERRAL COMMISSION LOGIC (18.7% from YOUR side)
        if (userData.referredByCode) {
            const referrerSnapshot = await db.ref('users')
                .orderByChild('referralCode')
                .equalTo(userData.referredByCode)
                .once('value');
            
            if (referrerSnapshot.exists()) {
                referrerSnapshot.forEach(async (childSnapshot) => {
                    const referrerId = childSnapshot.key;
                    const referrerData = childSnapshot.val();
                    
                    // Calculate commission from YOUR side
                    const commissionAmount = plan.price * plan.commissionRate;
                    
                    // Update referrer's balance with commission
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
                        lastCommissionDate: new Date().toISOString()
                    });
                    
                    // Update referrer's referrals list
                    const updatedReferrals = (referrerData.referrals || []).map(ref => {
                        if (ref.userId === userId) {
                            return {
                                ...ref,
                                hasInvested: true,
                                totalInvested: plan.price,
                                commissionEarned: commissionAmount,
                                lastInvestmentDate: new Date().toISOString()
                            };
                        }
                        return ref;
                    });
                    
                    await db.ref(`users/${referrerId}`).update({
                        referrals: updatedReferrals
                    });
                    
                    // Create commission transaction for referrer
                    const commissionTransactionId = generateTransactionId();
                    await db.ref(`transactions/${referrerId}/${commissionTransactionId}`).set({
                        id: commissionTransactionId,
                        type: 'referral_commission',
                        amount: commissionAmount,
                        fromUserId: userId,
                        fromUserName: userData.name,
                        investmentAmount: plan.price,
                        commissionRate: `${plan.commissionRate * 100}%`,
                        planName: plan.name,
                        date: new Date().toISOString(),
                        status: 'completed',
                        note: `Commission from ${userData.name}'s investment in ${plan.name}`
                    });
                    
                    console.log(`✅ Paid ₹${commissionAmount} commission to referrer ${referrerData.name}`);
                });
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Investment successful',
            investmentId: investmentId,
            newBalance: newBalance,
            dailyIncome: plan.dailyIncome,
            nextPayout: 'Tomorrow at 9:00 AM',
            totalDays: plan.duration,
            totalReturn: plan.totalIncome
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

// 8. CREATE WITHDRAWAL REQUEST
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, bankDetails } = req.body;
        
        if (!userId || !amount || amount < 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum withdrawal amount is ₹100' 
            });
        }
        
        // Check user balance
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const userData = userSnapshot.val();
        if (userData.balance < amount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient balance' 
            });
        }
        
        // Create withdrawal request
        const withdrawalId = generateWithdrawalId();
        const withdrawalData = {
            id: withdrawalId,
            userId: userId,
            userName: userData.name,
            amount: parseFloat(amount),
            bankDetails: bankDetails,
            date: new Date().toISOString(),
            status: 'pending',
            processedBy: null,
            processedAt: null
        };
        
        // Save withdrawal request
        await db.ref(`withdrawals/${withdrawalId}`).set(withdrawalData);
        
        // Deduct from user's balance immediately
        const newBalance = userData.balance - amount;
        await db.ref(`users/${userId}`).update({
            balance: newBalance,
            withdrawn: (userData.withdrawn || 0) + amount
        });
        
        // Create transaction record
        const transactionId = generateTransactionId();
        await db.ref(`transactions/${userId}/${transactionId}`).set({
            id: transactionId,
            type: 'withdrawal_request',
            amount: amount,
            status: 'pending',
            date: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            message: 'Withdrawal request submitted. Will be processed within 24-48 hours.',
            withdrawalId: withdrawalId,
            newBalance: newBalance
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
        
        // Check if already checked in today
        if (lastCheckin && new Date(lastCheckin).toDateString() === today) {
            return res.json({ 
                success: false, 
                message: 'Already checked in today' 
            });
        }
        
        // Calculate reward
        let reward = 50; // Base reward
        let streak = userData.dailyCheckin?.streak || 0;
        
        // Check if yesterday was checked in (for streak)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastCheckin && new Date(lastCheckin).toDateString() === yesterday.toDateString()) {
            streak += 1;
        } else {
            streak = 1; // Reset streak
        }
        
        // Bonus for 7-day streak
        if (streak % 7 === 0) {
            reward = 500;
        }
        
        // Update user data
        await userRef.update({
            balance: (userData.balance || 0) + reward,
            'dailyCheckin.lastCheckin': new Date().toISOString(),
            'dailyCheckin.streak': streak
        });
        
        // Create transaction record
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
        
        // Check if gift code exists
        const codeSnapshot = await db.ref(`giftCodes/${giftCode}`).once('value');
        if (!codeSnapshot.exists()) {
            return res.json({ 
                success: false, 
                message: 'Invalid gift code' 
            });
        }
        
        const codeData = codeSnapshot.val();
        
        // Check if code is active
        if (codeData.status !== 'active') {
            return res.json({ 
                success: false, 
                message: 'Gift code already used or expired' 
            });
        }
        
        // Check if code is for this user
        if (codeData.createdFor && codeData.createdFor !== userId) {
            return res.json({ 
                success: false, 
                message: 'This gift code is not for you' 
            });
        }
        
        // Update user balance
        const userRef = db.ref(`users/${userId}`);
        const userSnapshot = await userRef.once('value');
        const userData = userSnapshot.val();
        
        const newBalance = (userData.balance || 0) + codeData.amount;
        await userRef.update({
            balance: newBalance
        });
        
        // Mark gift code as used
        await db.ref(`giftCodes/${giftCode}`).update({
            status: 'used',
            usedBy: userId,
            usedAt: new Date().toISOString()
        });
        
        // Create transaction record
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
        
        // Get user's team members
        const teamSnapshot = await db.ref(`teams/${userId}`).once('value');
        const teamMembers = teamSnapshot.val() || {};
        
        // Calculate stats
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
                pendingCommission: totalInvestment * 0.187 // 18.7% of total investment
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
        
        // Convert to array
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
        
        // Get user's transactions
        const today = new Date().toDateString();
        let todayIncome = 0;
        let totalIncome = 0;
        let referralIncome = 0;
        
        const txSnapshot = await db.ref(`transactions/${userId}`).once('value');
        const transactions = txSnapshot.val() || {};
        
        Object.values(transactions).forEach(tx => {
            if (tx.type === 'daily_income') {
                totalIncome += tx.amount || 0;
                
                // Check if today's income
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
        
        res.json({ 
            success: true, 
            todayIncome: todayIncome,
            totalIncome: totalIncome,
            referralIncome: referralIncome
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
        const { type } = req.query; // daily, commission, gift
        
        const txSnapshot = await db.ref(`transactions/${userId}`).once('value');
        const transactions = txSnapshot.val() || {};
        
        let filteredTransactions = Object.values(transactions).filter(tx => {
            if (type === 'daily') return tx.type === 'daily_income';
            if (type === 'commission') return tx.type === 'referral_commission';
            if (type === 'gift') return tx.type === 'gift_code' || tx.type === 'checkin';
            return true; // Return all if no filter
        });
        
        // Sort by date (newest first)
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
        
        // Get user's withdrawals
        const withdrawalsSnapshot = await db.ref('withdrawals').orderByChild('userId').equalTo(userId).once('value');
        const withdrawals = withdrawalsSnapshot.val() || {};
        
        // Convert to array and sort by date
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
        
        // Remove passwords
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
        
        // Update recharge status
        await db.ref(`recharges/${rechargeId}`).update({
            status: 'approved',
            approvedBy: 'admin',
            approvedAt: new Date().toISOString()
        });
        
        // Update user balance
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
        
        // Create transaction record
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
        const { withdrawalId, status } = req.body; // status: 'completed' or 'rejected'
        
        if (!withdrawalId || !status) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid request' 
            });
        }
        
        // Update withdrawal status
        const updateData = {
            status: status,
            processedBy: 'admin',
            processedAt: new Date().toISOString()
        };
        
        await db.ref(`withdrawals/${withdrawalId}`).update(updateData);
        
        // Get withdrawal data
        const withdrawalSnapshot = await db.ref(`withdrawals/${withdrawalId}`).once('value');
        const withdrawalData = withdrawalSnapshot.val();
        
        if (status === 'completed') {
            // Update transaction status
            const txSnapshot = await db.ref(`transactions/${withdrawalData.userId}`)
                .orderByChild('type').equalTo('withdrawal_request')
                .orderByChild('amount').equalTo(withdrawalData.amount)
                .limitToLast(1)
                .once('value');
            
            txSnapshot.forEach(childSnapshot => {
                db.ref(`transactions/${withdrawalData.userId}/${childSnapshot.key}`).update({
                    status: 'completed'
                });
            });
        } else if (status === 'rejected') {
            // Refund amount to user if rejected
            const userRef = db.ref(`users/${withdrawalData.userId}`);
            const userSnapshot = await userRef.once('value');
            const userData = userSnapshot.val();
            
            const newBalance = (userData.balance || 0) + withdrawalData.amount;
            await userRef.update({
                balance: newBalance,
                withdrawn: (userData.withdrawn || 0) - withdrawalData.amount
            });
        }
        
        res.json({ 
            success: true, 
            message: `Withdrawal ${status} successfully`
        });
        
    } catch (error) {
        console.error('Process withdrawal error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
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
        
        const result = await distributeDailyIncome();
        
        res.json({
            success: true,
            message: 'Daily income distributed successfully',
            result: result
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
        
        // Calculate stats
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
                
                // Add to top referrers
                stats.topReferrers.push({
                    name: user.name,
                    phone: user.phone,
                    referrals: user.referrals.length,
                    totalCommission: totalCommission,
                    totalInvestment: totalInvestment
                });
            }
        });
        
        // Sort top referrers by commission
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

// ==================== DAILY INCOME DISTRIBUTION FUNCTION ====================
async function distributeDailyIncome() {
    console.log('💰 Starting daily income distribution...');
    
    try {
        const investmentsSnapshot = await db.ref('investments').once('value');
        const allInvestments = investmentsSnapshot.val() || {};
        
        let totalDistributed = 0;
        let usersPaid = 0;
        
        // Process each user's investments
        for (const userId in allInvestments) {
            const userInvestments = allInvestments[userId];
            
            for (const investmentId in userInvestments) {
                const investment = userInvestments[investmentId];
                
                // Check if investment is active and has days remaining
                if (investment.status === 'active' && investment.daysRemaining > 0) {
                    
                    const dailyIncome = investment.dailyIncome || 0;
                    
                    if (dailyIncome > 0) {
                        // Update user balance
                        const userRef = db.ref(`users/${userId}`);
                        const userSnapshot = await userRef.once('value');
                        const userData = userSnapshot.val();
                        
                        const newBalance = (userData.balance || 0) + dailyIncome;
                        const newTotalEarnings = (userData.totalEarnings || 0) + dailyIncome;
                        
                        await userRef.update({
                            balance: newBalance,
                            totalEarnings: newTotalEarnings,
                            lastIncomeDate: new Date().toISOString()
                        });
                        
                        // Update investment
                        const newTotalEarned = (investment.totalEarned || 0) + dailyIncome;
                        const newDaysRemaining = investment.daysRemaining - 1;
                        
                        let newStatus = 'active';
                        if (newDaysRemaining <= 0) {
                            newStatus = 'completed';
                        }
                        
                        await db.ref(`investments/${userId}/${investmentId}`).update({
                            totalEarned: newTotalEarned,
                            daysRemaining: newDaysRemaining,
                            status: newStatus,
                            lastPayout: new Date().toISOString(),
                            nextPayoutDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                            payoutCount: (investment.payoutCount || 0) + 1
                        });
                        
                        // Create transaction record
                        const transactionId = generateTransactionId();
                        await db.ref(`transactions/${userId}/${transactionId}`).set({
                            id: transactionId,
                            type: 'daily_income',
                            amount: dailyIncome,
                            investmentId: investmentId,
                            planName: investment.planName,
                            date: new Date().toISOString(),
                            status: 'completed',
                            note: `Daily income from ${investment.planName}`
                        });
                        
                        totalDistributed += dailyIncome;
                        usersPaid++;
                        
                        console.log(`✅ Paid ₹${dailyIncome} daily income to ${userId}`);
                    }
                }
            }
        }
        
        // Save distribution log
        await db.ref('dailyIncomeLogs').push({
            date: new Date().toISOString(),
            totalDistributed: totalDistributed,
            usersPaid: usersPaid,
            timestamp: Date.now(),
            type: 'auto_distribution'
        });
        
        console.log(`✅ Daily income complete: ₹${totalDistributed} distributed to ${usersPaid} users`);
        return { totalDistributed, usersPaid };
        
    } catch (error) {
        console.error('❌ Daily income distribution error:', error);
        throw error;
    }
}

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API is running',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        plansCount: Object.keys(NEW_PLANS).length
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
    console.log(`✅ Happy Invest API running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ Total APIs: 25 endpoints`);
    console.log(`✅ Investment Plans: ${Object.keys(NEW_PLANS).length} plans`);
    console.log(`✅ Health Check: http://localhost:${PORT}/api/health`);
    
    // Start daily income scheduler
    startDailyIncomeScheduler();
});

module.exports = app;
