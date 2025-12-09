const mongoose = require('mongoose');
require('dotenv').config();

const Livestock = require('./models/Livestock');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;

async function seedDatabase() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB for seeding');

        // Clear existing data
        await Livestock.deleteMany({});
        await User.deleteMany({ email: 'admin@livestockmart.com' });

        // Create admin user
        const adminUser = new User({
            name: 'Admin User',
            email: 'admin@livestockmart.com',
            password: 'admin123',
            cart: [],
            wishlist: [],
            addresses: []
        });
        await adminUser.save();
        console.log('✅ Admin user created: admin@livestockmart.com / admin123');

        // Create livestock data
        const livestockData = [
            {
                name: 'Premium Alpine Goat',
                type: 'Goat',
                breed: 'Alpine',
                age: '2 years',
                price: 18000,
                image: '🐐',
                description: 'High milk yield Alpine goat, vaccinated and healthy',
                weight: '45 kg',
                healthStatus: 'Excellent',
                tags: ['Milk Producer', 'Vaccinated', 'Healthy', 'Premium'],
                status: 'Available',
                quantity: 5
            },
            {
                name: 'Merino Wool Sheep',
                type: 'Sheep',
                breed: 'Merino',
                age: '3 years',
                price: 25000,
                image: '🐑',
                description: 'Premium Merino sheep for wool production',
                weight: '65 kg',
                healthStatus: 'Very Good',
                tags: ['Wool Producer', 'Premium', 'Healthy'],
                status: 'Available',
                quantity: 3
            },
            {
                name: 'Saanen Dairy Goat',
                type: 'Goat',
                breed: 'Saanen',
                age: '1.5 years',
                price: 22000,
                image: '🐐',
                description: 'Pure breed Saanen goat with high milk production',
                weight: '50 kg',
                healthStatus: 'Excellent',
                tags: ['Dairy', 'High Yield', 'Vaccinated'],
                status: 'Available',
                quantity: 4
            },
            {
                name: 'Boer Meat Goat',
                type: 'Goat',
                breed: 'Boer',
                age: '2.5 years',
                price: 28000,
                image: '🐐',
                description: 'Fast growing Boer goat for meat production',
                weight: '70 kg',
                healthStatus: 'Good',
                tags: ['Meat Producer', 'Fast Growing', 'Healthy'],
                status: 'Available',
                quantity: 2
            },
            {
                name: 'Dorper Sheep',
                type: 'Sheep',
                breed: 'Dorper',
                age: '2 years',
                price: 32000,
                image: '🐑',
                description: 'Premium Dorper sheep known for meat quality',
                weight: '75 kg',
                healthStatus: 'Excellent',
                tags: ['Meat Producer', 'Premium', 'Healthy'],
                status: 'Available',
                quantity: 3
            },
            {
                name: 'Nubian Goat',
                type: 'Goat',
                breed: 'Nubian',
                age: '1 year',
                price: 15000,
                image: '🐐',
                description: 'Young Nubian goat adaptable to various climates',
                weight: '35 kg',
                healthStatus: 'Very Good',
                tags: ['Adaptable', 'Young', 'Healthy'],
                status: 'Available',
                quantity: 6
            }
        ];

        const insertedLivestock = await Livestock.insertMany(livestockData);
        console.log(`✅ ${insertedLivestock.length} livestock items seeded`);

        // Create test customer
        const testUser = new User({
            name: 'Test Customer',
            email: 'customer@test.com',
            password: 'test123',
            cart: [],
            wishlist: [],
            addresses: [{
                label: 'Home',
                name: 'Test Customer',
                phone: '9876543210',
                line1: '123 Test Street',
                line2: 'Near Test Market',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001'
            }]
        });
        await testUser.save();
        console.log('✅ Test customer created: customer@test.com / test123');

        await mongoose.disconnect();
        console.log('✅ Database seeding completed successfully!');
        console.log('\n🔑 Test Credentials:');
        console.log('Admin: admin@livestockmart.com / admin123');
        console.log('Customer: customer@test.com / test123');
        console.log('\n🌐 API URL: https://goat-user.vercel.app/api');
        console.log('📊 Health check: https://goat-user.vercel.app/api/health');
        
    } catch (error) {
        console.error('❌ Seeding error:', error);
        process.exit(1);
    }
}

seedDatabase();