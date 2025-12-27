const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// ==================== FIREBASE INITIALIZATION ====================
let db = null;

try {
    console.log('🚀 Initializing Firebase...');
    
    // Build service account from environment variables
    const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
        token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: process.env.FIREBASE_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
        universe_domain: "googleapis.com"
    };
    
    // Initialize Firebase
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    
    db = admin.database();
    console.log('✅ Firebase initialized successfully');
    
} catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    process.exit(1);
}

// ==================== HELPER FUNCTIONS ====================
const generateUserId = () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateReferralCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateTransactionId = () => `txn_${Date.now()}`;
const generateInvestmentId = () => `inv_${Date.now()}`;
const generateWithdrawalId = () => `wd_${Date.now()}`;
const generateRechargeId = () => `recharge_${Date.now()}`;

// ==================== AUTHENTICATION APIs ====================

// 1. USER REGISTRATION
app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, password, referralCode } = req.body;
        
        // Validation
        if (!name || !phone || !password) {
            return res.status(400).json({ success: false, message: 'All fields required' });
        }
        
        if (phone.length !== 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: 'Invalid phone number' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be 6+ characters' });
        }
        
        // Check if phone exists
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('phone').equalTo(phone).once('value');
        
        if (snapshot.exists()) {
            return res.status(400).json({ success: false, message: 'Phone already registered' });
        }
        
        // Create user
        const userId = generateUserId();
        const userReferralCode = generateReferralCode();
        
        const userData = {
            id: userId,
            name: name.trim(),
            phone: phone,
            password: password,
            referralCode: userReferralCode,
            referredBy: referralCode || null,
            balance: 0,
            rechargeBalance: 0,
            withdrawn: 0,
            totalEarnings: 0,
            joinDate: new Date().toISOString(),
            status: 'active',
            level: 1,
            teamCount: 0,
            referralLink: `https://happyinvest.vercel.app/register.html?ref=${userReferralCode}`,
            bankDetails: null,
            dailyCheckin: { lastCheckin: null, streak: 0 }
        };
        
        // Save user
        await db.ref(`users/${userId}`).set(userData);
        
        // Handle referral
        if (referralCode) {
            const referrerSnapshot = await usersRef.orderByChild('referralCode').equalTo(referralCode).once('value');
            if (referrerSnapshot.exists()) {
                referrerSnapshot.forEach(async (childSnapshot) => {
                    const referrerId = childSnapshot.key;
                    
                    // Update referrer's team count
                    await db.ref(`users/${referrerId}`).update({
                        teamCount: (childSnapshot.val().teamCount || 0) + 1
                    });
                    
                    // Add to referrer's team
                    await db.ref(`teams/${referrerId}/${userId}`).set({
                        userId: userId,
                        name: name,
                        phone: phone,
                        joinDate: new Date().toISOString(),
                        level: 1
                    });
                });
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
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 2. USER LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        
        if (!phone || !password) {
            return res.status(400).json({ success: false, message: 'Phone and password required' });
        }
        
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('phone').equalTo(phone).once('value');
        
        if (!snapshot.exists()) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        let user = null;
        snapshot.forEach((childSnapshot) => {
            const userData = childSnapshot.val();
            if (userData.password === password) {
                user = { id: childSnapshot.key, ...userData };
                delete user.password;
            }
        });
        
        if (user) {
            res.json({ success: true, message: 'Login successful', user: user });
        } else {
            res.status(401).json({ success: false, message: 'Invalid password' });
        }
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 3. GET USER DATA
app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const snapshot = await db.ref(`users/${userId}`).once('value');
        
        if (!snapshot.exists()) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userData = snapshot.val();
        if (userData.password) delete userData.password;
        
        res.json({ success: true, user: userData });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== RECHARGE & WITHDRAWAL ====================

// 4. CREATE RECHARGE REQUEST
app.post('/api/recharge', async (req, res) => {
    try {
        const { userId, amount, paymentMethod, transactionId } = req.body;
        
        if (!userId || !amount || amount < 100) {
            return res.status(400).json({ success: false, message: 'Invalid request' });
        }
        
        // Create recharge request
        const rechargeId = generateRechargeId();
        const rechargeData = {
            id: rechargeId,
            userId: userId,
            amount: parseFloat(amount),
            paymentMethod: paymentMethod || 'manual',
            transactionId: transactionId || null,
            date: new Date().toISOString(),
            status: 'pending',
            approvedBy: null,
            approvedAt: null
        };
        
        await db.ref(`recharges/${rechargeId}`).set(rechargeData);
        
        res.json({ 
            success: true, 
            message: 'Recharge request submitted',
            rechargeId: rechargeId
        });
        
    } catch (error) {
        console.error('Recharge error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 5. CREATE WITHDRAWAL REQUEST
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, bankDetails } = req.body;
        
        if (!userId || !amount || amount < 100) {
            return res.status(400).json({ success: false, message: 'Invalid request' });
        }
        
        // Check user balance
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userData = userSnapshot.val();
        if (userData.balance < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        
        // Deduct balance
        const newBalance = userData.balance - amount;
        await db.ref(`users/${userId}`).update({
            balance: newBalance,
            withdrawn: (userData.withdrawn || 0) + amount
        });
        
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
        
        await db.ref(`withdrawals/${withdrawalId}`).set(withdrawalData);
        
        // Transaction record
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
            message: 'Withdrawal request submitted',
            withdrawalId: withdrawalId,
            newBalance: newBalance
        });
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 6. SAVE BANK DETAILS
app.post('/api/save-bank', async (req, res) => {
    try {
        const { userId, bankDetails } = req.body;
        
        if (!userId || !bankDetails) {
            return res.status(400).json({ success: false, message: 'Bank details required' });
        }
        
        await db.ref(`users/${userId}`).update({
            bankDetails: bankDetails
        });
        
        res.json({ success: true, message: 'Bank details saved' });
        
    } catch (error) {
        console.error('Save bank error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== INVESTMENT PLANS ====================

// 7. GET INVESTMENT PLANS
app.get('/api/plans', async (req, res) => {
    try {
        const plans = {
            "wind_1": { id: "wind_1", name: "Wind 1", price: 800, currency: "₹", duration: 22, dailyIncome: 279, totalIncome: 6138, type: "daily" },
            "wind_2": { id: "wind_2", name: "Wind 2", price: 560, currency: "₹", duration: 9, dailyIncome: 1447, totalIncome: 13023, type: "daily" },
            "wind_3": { id: "wind_3", name: "Wind 3", price: 1000, currency: "₹", duration: 10, dailyIncome: 3900, totalIncome: 39000, type: "daily" },
            "wind_4": { id: "wind_4", name: "Wind 4", price: 1600, currency: "₹", duration: 6, dailyIncome: 4730, totalIncome: 28380, type: "daily" },
            "wind_5": { id: "wind_5", name: "Wind 5", price: 1600, currency: "$", duration: 8, dailyIncome: 7350, totalIncome: 58800, type: "vip" },
            "wind_6": { id: "wind_6", name: "Wind 6", price: 2800, currency: "¥", duration: 4, dailyIncome: 17687, totalIncome: 70748, type: "vip" },
            "wind_7": { id: "wind_7", name: "Wind 7", price: 5000, currency: "$", duration: 1, dailyIncome: 32600, totalIncome: 32600, type: "vip" },
            "wind_power_a": { id: "wind_power_a", name: "Wind Power - A", price: 450, currency: "¥", duration: 3, dailyIncome: 1830, totalIncome: 5490, type: "daily" },
            "wind_power_b": { id: "wind_power_b", name: "Wind Power - B", price: 900, currency: "¥", duration: 4, dailyIncome: 3900, totalIncome: 15600, type: "daily" }
        };
        
        res.json({ success: true, plans: plans });
        
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 8. INVEST IN PLAN
app.post('/api/invest', async (req, res) => {
    try {
        const { userId, planId } = req.body;
        
        if (!userId || !planId) {
            return res.status(400).json({ success: false, message: 'User ID and Plan ID required' });
        }
        
        // Plan details
        const plans = {
            "wind_1": { price: 800, dailyIncome: 279, totalIncome: 6138, duration: 22, name: "Wind 1" },
            "wind_2": { price: 560, dailyIncome: 1447, totalIncome: 13023, duration: 9, name: "Wind 2" },
            "wind_3": { price: 1000, dailyIncome: 3900, totalIncome: 39000, duration: 10, name: "Wind 3" },
            "wind_4": { price: 1600, dailyIncome: 4730, totalIncome: 28380, duration: 6, name: "Wind 4" },
            "wind_5": { price: 1600, dailyIncome: 7350, totalIncome: 58800, duration: 8, name: "Wind 5" },
            "wind_6": { price: 2800, dailyIncome: 17687, totalIncome: 70748, duration: 4, name: "Wind 6" },
            "wind_7": { price: 5000, dailyIncome: 32600, totalIncome: 32600, duration: 1, name: "Wind 7" },
            "wind_power_a": { price: 450, dailyIncome: 1830, totalIncome: 5490, duration: 3, name: "Wind Power - A" },
            "wind_power_b": { price: 900, dailyIncome: 3900, totalIncome: 15600, duration: 4, name: "Wind Power - B" }
        };
        
        const plan = plans[planId];
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        
        // Check user balance
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        if (!userSnapshot.exists()) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userData = userSnapshot.val();
        if (userData.balance < plan.price) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        
        // Deduct balance
        const newBalance = userData.balance - plan.price;
        await db.ref(`users/${userId}`).update({ balance: newBalance });
        
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
            totalEarned: 0
        };
        
        await db.ref(`investments/${userId}/${investmentId}`).set(investmentData);
        
        // Transaction record
        const transactionId = generateTransactionId();
        await db.ref(`transactions/${userId}/${transactionId}`).set({
            id: transactionId,
            type: 'investment',
            amount: plan.price,
            planId: planId,
            date: new Date().toISOString(),
            status: 'completed'
        });
        
        res.json({ 
            success: true, 
            message: 'Investment successful',
            investmentId: investmentId,
            newBalance: newBalance
        });
        
    } catch (error) {
        console.error('Invest error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 9. GET USER INVESTMENTS
app.get('/api/user-investments/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const snapshot = await db.ref(`investments/${userId}`).once('value');
        const investments = snapshot.val() || {};
        
        res.json({ success: true, investments: investments });
        
    } catch (error) {
        console.error('Get investments error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== DAILY CHECK-IN ====================

// 10. DAILY CHECK-IN
app.post('/api/checkin', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID required' });
        }
        
        const userRef = db.ref(`users/${userId}`);
        const snapshot = await userRef.once('value');
        
        if (!snapshot.exists()) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userData = snapshot.val();
        const today = new Date().toDateString();
        const lastCheckin = userData.dailyCheckin?.lastCheckin;
        
        // Check if already checked in today
        if (lastCheckin && new Date(lastCheckin).toDateString() === today) {
            return res.json({ success: false, message: 'Already checked in today' });
        }
        
        // Calculate reward and streak
        let reward = 50;
        let streak = userData.dailyCheckin?.streak || 0;
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastCheckin && new Date(lastCheckin).toDateString() === yesterday.toDateString()) {
            streak += 1;
        } else {
            streak = 1;
        }
        
        // Bonus for 7-day streak
        if (streak % 7 === 0) {
            reward = 500;
        }
        
        // Update user
        await userRef.update({
            balance: (userData.balance || 0) + reward,
            'dailyCheckin.lastCheckin': new Date().toISOString(),
            'dailyCheckin.streak': streak
        });
        
        // Transaction record
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
        res.status(500).json({ success: false, message: 'Server error' });
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
            streak: checkinData.streak || 0
        });
        
    } catch (error) {
        console.error('Check-in status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== GIFT CODES ====================

// 12. REDEEM GIFT CODE
app.post('/api/redeem-gift', async (req, res) => {
    try {
        const { userId, giftCode } = req.body;
        
        if (!userId || !giftCode) {
            return res.status(400).json({ success: false, message: 'User ID and Gift Code required' });
        }
        
        // Check gift code
        const codeSnapshot = await db.ref(`giftCodes/${giftCode}`).once('value');
        if (!codeSnapshot.exists()) {
            return res.json({ success: false, message: 'Invalid gift code' });
        }
        
        const codeData = codeSnapshot.val();
        if (codeData.status !== 'active') {
            return res.json({ success: false, message: 'Gift code already used' });
        }
        
        // Update user balance
        const userRef = db.ref(`users/${userId}`);
        const userSnapshot = await userRef.once('value');
        const userData = userSnapshot.val();
        
        const newBalance = (userData.balance || 0) + codeData.amount;
        await userRef.update({ balance: newBalance });
        
        // Mark gift code as used
        await db.ref(`giftCodes/${giftCode}`).update({
            status: 'used',
            usedBy: userId,
            usedAt: new Date().toISOString()
        });
        
        // Transaction record
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
            message: 'Gift code redeemed',
            amount: codeData.amount,
            newBalance: newBalance
        });
        
    } catch (error) {
        console.error('Redeem gift error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== TEAM & COMMISSION ====================

// 13. GET TEAM STATS
app.get('/api/team-stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const teamSnapshot = await db.ref(`teams/${userId}`).once('value');
        const teamMembers = teamSnapshot.val() || {};
        
        let level1 = 0, level2 = 0, level3 = 0;
        Object.values(teamMembers).forEach(member => {
            if (member.level === 1) level1++;
            else if (member.level === 2) level2++;
            else if (member.level === 3) level3++;
        });
        
        res.json({ 
            success: true, 
            stats: {
                level1Members: level1,
                level2Members: level2,
                level3Members: level3,
                level1Recharges: 0,
                level2Recharges: 0,
                level3Recharges: 0
            }
        });
        
    } catch (error) {
        console.error('Team stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 14. GET TEAM MEMBERS
app.get('/api/team-members/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const snapshot = await db.ref(`teams/${userId}`).once('value');
        const teamMembers = snapshot.val() || {};
        
        res.json({ success: true, members: Object.values(teamMembers) });
        
    } catch (error) {
        console.error('Team members error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== INCOME & TRANSACTIONS ====================

// 15. GET INCOME STATS
app.get('/api/income-stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const txSnapshot = await db.ref(`transactions/${userId}`).once('value');
        const transactions = txSnapshot.val() || {};
        
        let todayIncome = 0, totalIncome = 0;
        const today = new Date().toDateString();
        
        Object.values(transactions).forEach(tx => {
            if (['daily_income', 'commission', 'gift_code', 'checkin'].includes(tx.type)) {
                totalIncome += tx.amount || 0;
                const txDate = new Date(tx.date).toDateString();
                if (txDate === today) todayIncome += tx.amount || 0;
            }
        });
        
        res.json({ success: true, todayIncome: todayIncome, totalIncome: totalIncome });
        
    } catch (error) {
        console.error('Income stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 16. GET INCOME RECORDS
app.get('/api/income-records/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { type } = req.query;
        
        const txSnapshot = await db.ref(`transactions/${userId}`).once('value');
        const transactions = txSnapshot.val() || {};
        
        let filtered = Object.values(transactions).filter(tx => {
            if (type === 'daily') return tx.type === 'daily_income';
            if (type === 'commission') return tx.type === 'commission';
            if (type === 'gift') return tx.type === 'gift_code' || tx.type === 'checkin';
            return true;
        });
        
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({ success: true, records: filtered });
        
    } catch (error) {
        console.error('Income records error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 17. GET WITHDRAWAL HISTORY
app.get('/api/withdrawal-history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const snapshot = await db.ref('withdrawals').orderByChild('userId').equalTo(userId).once('value');
        const withdrawals = snapshot.val() || {};
        
        const withdrawalsArray = Object.values(withdrawals).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        
        res.json({ success: true, withdrawals: withdrawalsArray });
        
    } catch (error) {
        console.error('Withdrawal history error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== ADMIN APIs ====================

// 18. ADMIN LOGIN
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'happyinvest123';
    
    if (password === adminPassword) {
        res.json({ success: true, message: 'Admin login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// 19. APPROVE RECHARGE
app.post('/api/admin/approve-recharge', async (req, res) => {
    try {
        const { rechargeId, userId, amount } = req.body;
        const { password } = req.query;
        
        // Admin authentication
        if (password !== (process.env.ADMIN_PASSWORD || 'happyinvest123')) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
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
            rechargeBalance: newRechargeBalance
        });
        
        // Transaction record
        const transactionId = generateTransactionId();
        await db.ref(`transactions/${userId}/${transactionId}`).set({
            id: transactionId,
            type: 'recharge',
            amount: amount,
            date: new Date().toISOString(),
            status: 'completed'
        });
        
        res.json({ success: true, message: 'Recharge approved' });
        
    } catch (error) {
        console.error('Approve recharge error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 20. PROCESS WITHDRAWAL
app.post('/api/admin/process-withdrawal', async (req, res) => {
    try {
        const { withdrawalId, status } = req.body;
        const { password } = req.query;
        
        // Admin authentication
        if (password !== (process.env.ADMIN_PASSWORD || 'happyinvest123')) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        // Update withdrawal status
        await db.ref(`withdrawals/${withdrawalId}`).update({
            status: status,
            processedBy: 'admin',
            processedAt: new Date().toISOString()
        });
        
        // If rejected, refund amount
        if (status === 'rejected') {
            const withdrawalSnapshot = await db.ref(`withdrawals/${withdrawalId}`).once('value');
            const withdrawalData = withdrawalSnapshot.val();
            
            const userRef = db.ref(`users/${withdrawalData.userId}`);
            const userSnapshot = await userRef.once('value');
            const userData = userSnapshot.val();
            
            const newBalance = (userData.balance || 0) + withdrawalData.amount;
            await userRef.update({
                balance: newBalance,
                withdrawn: (userData.withdrawn || 0) - withdrawalData.amount
            });
        }
        
        res.json({ success: true, message: `Withdrawal ${status}` });
        
    } catch (error) {
        console.error('Process withdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 21. GET PENDING RECHARGES
app.get('/api/admin/pending-recharges', async (req, res) => {
    try {
        const { password } = req.query;
        
        if (password !== (process.env.ADMIN_PASSWORD || 'happyinvest123')) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const snapshot = await db.ref('recharges').orderByChild('status').equalTo('pending').once('value');
        const recharges = snapshot.val() || {};
        
        res.json({ success: true, recharges: recharges });
        
    } catch (error) {
        console.error('Pending recharges error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 22. GET PENDING WITHDRAWALS
app.get('/api/admin/pending-withdrawals', async (req, res) => {
    try {
        const { password } = req.query;
        
        if (password !== (process.env.ADMIN_PASSWORD || 'happyinvest123')) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const snapshot = await db.ref('withdrawals').orderByChild('status').equalTo('pending').once('value');
        const withdrawals = snapshot.val() || {};
        
        res.json({ success: true, withdrawals: withdrawals });
        
    } catch (error) {
        console.error('Pending withdrawals error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 23. GET ALL USERS
app.get('/api/admin/users', async (req, res) => {
    try {
        const { password } = req.query;
        
        if (password !== (process.env.ADMIN_PASSWORD || 'happyinvest123')) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const snapshot = await db.ref('users').once('value');
        const users = snapshot.val() || {};
        
        // Remove passwords
        Object.keys(users).forEach(key => {
            if (users[key].password) delete users[key].password;
        });
        
        res.json({ success: true, users: users });
        
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== HEALTH CHECK ====================

// 24. HEALTH CHECK
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Happy Invest API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ==================== ERROR HANDLING ====================

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// Error Handler
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
    console.log(`✅ Health Check: http://localhost:${PORT}/api/health`);
    console.log(`✅ Total Endpoints: 24 APIs`);
});

module.exports = app;
