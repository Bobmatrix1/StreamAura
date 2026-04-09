import React from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Image,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Zap, Shield, Smartphone, Globe, Heart, Code, Coffee } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const About: React.FC = () => {
  const stats = [
    { label: 'Fast Downloads', icon: Zap, color: '#d946ef' },
    { label: 'Secure & Private', icon: Shield, color: '#22c55e' },
    { label: 'Cross Platform', icon: Smartphone, color: '#a855f7' },
    { label: 'Global Access', icon: Globe, color: '#d946ef' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Zap color="#d946ef" size={40} />
          </View>
          <Text style={styles.title}>About StreamAura</Text>
          <Text style={styles.subtitle}>The ultimate all-in-one media powerhouse for the modern mobile world.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Heart size={20} color="#f43f5e" fill="#f43f5e" />
              <Text style={styles.sectionTitle}>Our Mission</Text>
            </View>
            <Text style={styles.text}>
              StreamAura was born from a simple idea: media should be accessible, high-quality, and easy to save. 
              We believe that you should have the power to enjoy your favorite content anywhere, anytime.
            </Text>
          </View>

          <View style={styles.statsGrid}>
            {stats.map((item, i) => (
              <View key={i} style={styles.statItem}>
                <item.icon size={24} color={item.color} />
                <Text style={styles.statLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <View style={styles.versionRow}>
              <Code size={20} color="#d946ef" />
              <View>
                <Text style={styles.versionText}>v2.4.0 • Built with Passion</Text>
                <Text style={styles.versionSub}>LATEST STABLE RELEASE</Text>
              </View>
            </View>
            <View style={styles.coffeeRow}>
              <Coffee size={16} color="#94a3b8" />
              <Text style={styles.coffeeText}>Powered by coffee and code.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 30, gap: 10 },
  logoBox: { width: 80, height: 80, borderRadius: 25, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  title: { fontSize: 32, fontWeight: 'bold', color: 'white' },
  subtitle: { color: '#94a3b8', textAlign: 'center', fontSize: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 25, padding: 20, gap: 30 },
  section: { gap: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  text: { color: '#94a3b8', fontSize: 15, lineHeight: 22 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statItem: { width: (width - 70) / 2, backgroundColor: '#0f172a', padding: 15, borderRadius: 15, alignItems: 'center', gap: 8 },
  statLabel: { color: '#64748b', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  footer: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 20, gap: 15 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  versionText: { color: 'white', fontWeight: 'bold' },
  versionSub: { color: '#64748b', fontSize: 10, fontWeight: 'bold' },
  coffeeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' },
  coffeeText: { color: '#64748b', fontSize: 12, italic: true }
});

export default About;
