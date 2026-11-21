import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Shield, Eye, Database, Lock, Server, UserX } from "lucide-react";
import SEOHead from "@/components/SEOHead";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Privacy Policy — KeenVPN Zero Logs VPN"
        description="KeenVPN has a strict zero-logs policy. We never track, collect, or store your online activity. Read our full privacy policy."
        canonical="https://vpnkeen.com/privacy"
      />
      <Header />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center bg-card/50 backdrop-blur-sm border border-border rounded-full px-4 py-2 mb-6">
              <Shield className="h-4 w-4 text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Last updated: November 2, 2026</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Privacy Policy
            </h1>
            <p className="text-xl text-muted-foreground">
              Your privacy is our highest priority. Learn how we protect your data and maintain your anonymity.
            </p>
          </div>

          {/* Key Principles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="p-6 bg-gradient-card rounded-xl border border-border/50 text-center">
              <Eye className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">Zero Logs</h3>
              <p className="text-sm text-muted-foreground">We never track or store your online activity</p>
            </div>
            <div className="p-6 bg-gradient-card rounded-xl border border-border/50 text-center">
              <Database className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">No Data Collection</h3>
              <p className="text-sm text-muted-foreground">Your personal information stays private</p>
            </div>
            <div className="p-6 bg-gradient-card rounded-xl border border-border/50 text-center">
              <Lock className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">End-to-End Encryption</h3>
              <p className="text-sm text-muted-foreground">Military-grade protection for all data</p>
            </div>
          </div>

          {/* Content Sections */}
          <div className="prose prose-invert max-w-none">
            <div className="bg-gradient-card rounded-xl p-8 border border-border/50 mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center">
                <UserX className="h-6 w-6 text-primary mr-3" />
                Information We DON'T Collect
              </h2>
              <div className="text-muted-foreground space-y-3">
                <p>At KeenVPN, we are committed to true privacy. We specifically do NOT collect, log, or store:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Your IP address when connected to our VPN</li>
                  <li>Websites you visit or content you access</li>
                  <li>DNS queries or browsing history</li>
                  <li>Specific timestamps of when you access individual websites or services</li>
                  <li>Network traffic content or what data you transmit</li>
                  <li>Any personally identifiable information about your online activities or destinations</li>
                  <li>Connection logs that could link your activities to your identity</li>
                </ul>
                <p className="mt-4 text-sm italic">Note: While we do collect session duration and aggregated bandwidth for service optimization, this data is not linked to specific websites visited or content accessed, and cannot be used to identify your browsing behavior.</p>
              </div>
            </div>

            <div className="bg-gradient-card rounded-xl p-8 border border-border/50 mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center">
                <Database className="h-6 w-6 text-primary mr-3" />
                Limited Information We Collect
              </h2>
              <div className="text-muted-foreground space-y-4">
                <p>To provide our service, we collect only the minimal information necessary:</p>
                
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Account Information</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Email address (for account creation and support)</li>
                    <li>Payment information (processed by third-party providers)</li>
                    <li>Support ticket communications</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Technical Information</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>App version and operating system (for compatibility)</li>
                    <li>Crash reports (anonymous, for service improvement)</li>
                    <li>Aggregate bandwidth usage (for capacity planning)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-gradient-card rounded-xl p-8 border border-border/50 mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center">
                <Server className="h-6 w-6 text-primary mr-3" />
                Server Locations & Jurisdiction
              </h2>
              <div className="text-muted-foreground space-y-3">
                <p>KeenVPN operates under privacy-friendly jurisdictions with strong data protection laws:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Primary operations based in countries with no mandatory data retention laws</li>
                  <li>Servers located in privacy-respecting jurisdictions</li>
                  <li>No cooperation with mass surveillance programs</li>
                  <li>Regular security audits and transparency reports</li>
                </ul>
              </div>
            </div>

            <div className="bg-gradient-card rounded-xl p-8 border border-border/50 mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Data Sharing & Third Parties</h2>
              <div className="text-muted-foreground space-y-3">
                <p>We never sell, rent, or share your personal information with third parties for marketing purposes. KeenVPN uses Google in two separate, optional ways that are not the same product flow: (1) Sign in with Google for account authentication, and (2) an optional Gmail mailbox connection for Flight compensation. Neither path uses Google user data for advertising or marketing.</p>
                <p>We may share limited information only in these specific circumstances:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Payment processing (handled by secure, certified payment providers)</li>
                  <li>Legal compliance when required by valid court orders</li>
                  <li>Service providers who help us operate our platform (under strict confidentiality)</li>
                </ul>
              </div>
            </div>

            <div className="bg-gradient-card rounded-xl p-8 border border-border/50 mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Sign in with Google (account authentication — Limited Use)</h2>
              <div className="text-muted-foreground space-y-3">
                <p>This is ordinary account login. It is <strong>not</strong> mailbox access and does <strong>not</strong> grant KeenVPN permission to read your email.</p>
                <p>If you choose Sign in with Google, KeenVPN receives basic account information from Google (typically your Google account email address and display name, and a stable account identifier) solely to create or authenticate your KeenVPN account and provide subscription and VPN features. We do not request Gmail or other sensitive Google scopes as part of sign-in.</p>
                <p>KeenVPN’s use of Sign-In information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Sign-In Google user data is used only to provide or improve user-facing account features (sign-in, account management, and VPN service delivery).</li>
                  <li>We do not sell that data.</li>
                  <li>We do not use it for advertising, including personalized, retargeted, or interest-based advertising.</li>
                  <li>We do not use it for marketing campaigns, advertising measurement, or creditworthiness decisions.</li>
                  <li>We do not transfer it to third parties except as needed to operate KeenVPN (for example encrypted account storage), to comply with law, for security/abuse prevention, or as part of a merger or acquisition with prior user consent where required.</li>
                  <li>Human reading is not allowed except with your affirmative consent for support, for security/abuse investigation, or where required by law.</li>
                </ul>
                <p>The KeenVPN Android app does not collect or read advertising identifiers (AAID). Sign-in data from Google is not combined with website analytics, advertising tools, or Flight compensation mailbox data.</p>
              </div>
            </div>

            <div className="bg-gradient-card rounded-xl p-8 border border-border/50 mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Flight compensation — optional Gmail mailbox scan</h2>
              <div className="text-muted-foreground space-y-3">
                <p>Flight compensation is an optional member feature (currently offered via the KeenVPN web portal). Connecting Gmail for flight detection is a <strong>separate OAuth consent</strong> from Sign in with Google. Signing into KeenVPN with Google does not by itself allow us to read your mailbox.</p>
                <p>Only if you explicitly connect Gmail and agree to the in-product Flight compensation consent does KeenVPN request read-only Gmail access (<code>https://www.googleapis.com/auth/gmail.readonly</code>) through a dedicated OAuth client. That access is used solely to find flight booking confirmations and airline cancellation notices so we can check delays/cancellations and tell you when you may be owed compensation under applicable passenger rules.</p>
                <p>How mailbox data is handled:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Access is read-only. KeenVPN cannot send, delete, or change your email.</li>
                  <li>We search for messages that look like flight bookings or airline cancellation notices. Only those messages are opened.</li>
                  <li>Message content is processed in memory to extract flight details and is not stored as full email bodies.</li>
                  <li>We keep only the structured flight fields needed for the feature (such as airline, flight number, travel date, airports, and the date an airline told you a flight was cancelled), plus encrypted mailbox OAuth tokens until you disconnect.</li>
                  <li>You can disconnect at any time, which deletes our access tokens and stops scanning.</li>
                </ul>
                <p>KeenVPN’s use of Gmail data obtained for Flight compensation also adheres to the Google API Services User Data Policy, including Limited Use:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Gmail data is used only to provide or improve the user-facing Flight compensation feature.</li>
                  <li>We do not sell Gmail data.</li>
                  <li>We do not use Gmail data for advertising, marketing, advertising measurement, AI/ML training unrelated to this feature, or creditworthiness decisions.</li>
                  <li>We do not transfer Gmail data to third parties except as needed to operate this feature (for example flight-status data providers used to check delays/cancellations), to comply with law, for security/abuse prevention, or as part of a merger or acquisition with prior user consent where required.</li>
                  <li>Human reading of mailbox content is not allowed except with your affirmative consent for support, for security/abuse investigation, or where required by law.</li>
                </ul>
                <p>You may instead connect Outlook for the same Flight compensation feature under Microsoft’s permissions; that path is separate from Google.</p>
              </div>
            </div>

            <div className="bg-gradient-card rounded-xl p-8 border border-border/50 mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">VPN Data Collection</h2>
              <div className="text-muted-foreground space-y-3">
                <p><strong>What user information does KeenVPN collect using VPN?</strong></p>
                <p>We collect minimal technical data only to maintain service quality and security:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Account email and authentication credentials (for account management)</li>
                  <li>Payment information (securely processed by Stripe)</li>
                  <li>Connection session duration (total time connected, for usage analytics and service optimization)</li>
                  <li>Aggregated bandwidth usage (total data transferred, not linked to specific websites or activities)</li>
                  <li>App version and device OS type (for compatibility and support)</li>
                  <li>Server location you connected to (for service quality monitoring)</li>
                </ul>
                <p className="mt-4"><strong>What we do NOT collect:</strong></p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Browsing history, DNS queries, or websites visited</li>
                  <li>IP addresses while connected to VPN</li>
                  <li>Network traffic content or metadata</li>
                  <li>Specific timestamps of individual browsing activities</li>
                  <li>Any personally identifiable information about your online activities or destinations</li>
                </ul>
                <p className="mt-4"><strong>Purpose of data collection:</strong></p>
                <p>The limited data we collect is used solely for:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Account creation, authentication, and subscription management</li>
                  <li>Payment processing and billing</li>
                  <li>Technical support and troubleshooting</li>
                  <li>Service optimization and capacity planning (aggregated data only)</li>
                  <li>Security monitoring to prevent abuse</li>
                </ul>
                <p className="mt-4"><strong>Data sharing:</strong></p>
                <p>We do not sell or share VPN activity data, Google Sign-In data, or Flight compensation Gmail data with third parties for advertising or marketing. Limited operational data may be shared only with:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Stripe:</strong> For secure payment processing</li>
                  <li><strong>Google:</strong> (a) Sign in with Google for account authentication only; (b) optional Gmail read-only access solely for Flight compensation when you connect a mailbox, as described above. Google Play Billing may process purchases when you subscribe on Android.</li>
                  <li><strong>Apple:</strong> Sign in with Apple authentication and App Store billing where applicable</li>
                  <li><strong>Microsoft:</strong> Optional Outlook mailbox connection for Flight compensation (separate from Google)</li>
                  <li><strong>Supabase:</strong> For secure account data storage (encrypted)</li>
                  <li><strong>Flight-status data providers:</strong> To check whether detected flights were delayed or cancelled (structured flight fields only, not full email bodies)</li>
                </ul>
                <p>All data is stored securely with encryption and access controls. We never track or log your online activities.</p>
              </div>
            </div>

            <div className="bg-gradient-card rounded-xl p-8 border border-border/50 mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Your Rights</h2>
              <div className="text-muted-foreground space-y-3">
                <p>You have complete control over your information:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Access any personal data we have about you</li>
                  <li>Request correction of inaccurate information</li>
                  <li>Delete your account and associated data at any time</li>
                  <li>Export your account information</li>
                  <li>Opt out of marketing communications</li>
                </ul>
                <p className="mt-4"><strong>For California Residents (CCPA):</strong> You have additional rights including the right to know what personal information we collect and request deletion.</p>
                <p><strong>For EU/UK Residents (GDPR):</strong> You have rights including access, rectification, erasure, data portability, and objection to processing.</p>
              </div>
            </div>

            <div className="bg-gradient-card rounded-xl p-8 border border-border/50">
              <h2 className="text-2xl font-bold text-foreground mb-4">Contact Us</h2>
              <div className="text-muted-foreground">
                <p className="mb-4">Questions about our privacy practices? We're here to help:</p>
                <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                  <p><strong>Privacy Team:</strong> privacy@vpnkeen.com</p>
                  <p><strong>Support:</strong> support@vpnkeen.com</p>
                  <p><strong>Business Address:</strong></p>
                  <p className="ml-4">
                    21915 W Firemist Ct<br />
                    Cypress, TX 77433<br />
                    United States
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Privacy;