import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";

import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import SideDrawer from "../../components/SideDrawer";

/* ============================================================
   FIREBASE
============================================================ */

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "../../lib/firebase";

const SCREEN_WIDTH = Dimensions.get("window").width;

/* ============================================================
   HOME SCREEN
============================================================ */

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  /* ==========================================================
     HEADER ANIMATION
  ========================================================== */

  const headerOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const headerTranslate = useRef(
    new Animated.Value(-15)
  ).current;

  /* ==========================================================
     WELCOME CARD ANIMATION
  ========================================================== */

  const welcomeOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const welcomeTranslate = useRef(
    new Animated.Value(24)
  ).current;

  const welcomeScale = useRef(
    new Animated.Value(0.97)
  ).current;

  /* ==========================================================
     HEADER GLOW
  ========================================================== */

  const glowPulse = useRef(
    new Animated.Value(0)
  ).current;

  /* ==========================================================
     NOTIFICATION BELL
  ========================================================== */

  const bellScale = useRef(
    new Animated.Value(1)
  ).current;

  /* ==========================================================
     LOAD FIREBASE ANNOUNCEMENTS
  ========================================================== */

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const snapshot = await getDocs(
          collection(db, "announcements")
        );

        const data = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setAnnouncements(data);
      } catch (error) {
        console.log(
          "Error fetching announcements:",
          error
        );
      }
    };

    fetchAnnouncements();
  }, []);

  /* ==========================================================
     SCREEN ENTRANCE
  ========================================================== */

  useEffect(() => {
    Animated.sequence([
      /* HEADER */

      Animated.parallel([
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(headerTranslate, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      /* WELCOME CARD */

      Animated.parallel([
        Animated.spring(welcomeTranslate, {
          toValue: 0,
          damping: 16,
          stiffness: 115,
          mass: 0.8,
          useNativeDriver: true,
        }),

        Animated.spring(welcomeScale, {
          toValue: 1,
          damping: 16,
          stiffness: 115,
          mass: 0.8,
          useNativeDriver: true,
        }),

        Animated.timing(welcomeOpacity, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  /* ==========================================================
     SLOW HEADER GLOW
  ========================================================== */

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),

        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, []);

  /* ==========================================================
     BELL PULSE WHEN THERE IS ANNOUNCEMENT
  ========================================================== */

  useEffect(() => {
    if (announcements.length === 0) {
      bellScale.setValue(1);
      return;
    }

    const bellAnimation = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),

        Animated.spring(bellScale, {
          toValue: 1.13,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),

        Animated.spring(bellScale, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
      ])
    );

    bellAnimation.start();

    return () => {
      bellAnimation.stop();
    };
  }, [announcements.length]);

  /* ==========================================================
     GLOW INTERPOLATION
  ========================================================== */

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.68],
  });

  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <>
      <StatusBar
        style="light"
        backgroundColor="#7A1723"
      />

      <View style={styles.root}>
        {/* ====================================================
            MAIN SCROLL VIEW
        ==================================================== */}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
          indicatorStyle="black"
          bounces={false}
          overScrollMode="never"
          scrollIndicatorInsets={{
            top: insets.top + 8,
            right: 1,
            bottom: 10,
          }}
        >
          {/* ==================================================
              HEADER
          ================================================== */}

          <SafeAreaView
            edges={["top"]}
            style={styles.safeHeader}
          >
            <LinearGradient
              colors={[
                "#7A1723",
                "#A71F2D",
                "#D52E42",
                "#F05B68",
              ]}
              locations={[0, 0.34, 0.7, 1]}
              start={{
                x: 0,
                y: 0,
              }}
              end={{
                x: 1,
                y: 1,
              }}
              style={styles.header}
            >
              {/* LEFT SOFT GLOW */}

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.headerGlowLeft,
                  {
                    opacity: glowOpacity,

                    transform: [
                      {
                        scale: glowScale,
                      },
                    ],
                  },
                ]}
              />

              {/* RIGHT SOFT GLOW */}

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.headerGlowRight,
                  {
                    opacity: glowOpacity,

                    transform: [
                      {
                        scale: glowScale,
                      },
                    ],
                  },
                ]}
              />

              {/* SOFT LIGHT OVERLAY */}

              <LinearGradient
                pointerEvents="none"
                colors={[
                  "rgba(255,255,255,0.08)",
                  "rgba(255,255,255,0)",
                ]}
                start={{
                  x: 0,
                  y: 0,
                }}
                end={{
                  x: 1,
                  y: 1,
                }}
                style={styles.headerLight}
              />

              {/* HEADER CONTENT */}

              <Animated.View
                style={[
                  styles.headerContent,
                  {
                    opacity: headerOpacity,

                    transform: [
                      {
                        translateY:
                          headerTranslate,
                      },
                    ],
                  },
                ]}
              >
                {/* BRAND */}

                <View style={styles.brand}>
                  <Image
                    source={require(
                      "../../assets/images/logo.png"
                    )}
                    style={styles.logo}
                    resizeMode="cover"
                  />

                  <View style={styles.brandText}>
                    <Text style={styles.brandTitle}>
                      VolunServe
                    </Text>

                    <Text style={styles.brandSubtitle}>
                      City Disaster Response Platform
                    </Text>
                  </View>
                </View>

                {/* HEADER ACTIONS */}

                <View style={styles.headerActions}>
                  {/* NOTIFICATION */}

                  <Pressable
                    style={({ pressed }) => [
                      styles.headerButton,

                      pressed &&
                        styles.headerPressed,
                    ]}
                    onPress={() =>
                      router.push("/notifications")
                    }
                  >
                    <Animated.View
                      style={{
                        transform: [
                          {
                            scale: bellScale,
                          },
                        ],
                      }}
                    >
                      <Ionicons
                        name="notifications-outline"
                        size={28}
                        color="#FFFFFF"
                      />
                    </Animated.View>

                    {announcements.length > 0 && (
                      <View
                        style={
                          styles.notificationDot
                        }
                      />
                    )}
                  </Pressable>

                  {/* MENU */}

                  <Pressable
                    style={({ pressed }) => [
                      styles.headerButton,

                      pressed &&
                        styles.headerPressed,
                    ]}
                    onPress={() =>
                      setDrawerOpen(true)
                    }
                  >
                    <Ionicons
                      name="menu-outline"
                      size={31}
                      color="#FFFFFF"
                    />
                  </Pressable>
                </View>
              </Animated.View>
            </LinearGradient>
          </SafeAreaView>

          {/* ==================================================
              BODY
          ================================================== */}

          <View style={styles.body}>
            {/* =================================================
                WELCOME CARD
            ================================================= */}

            <Animated.View
              style={[
                styles.welcomeCard,
                {
                  opacity: welcomeOpacity,

                  transform: [
                    {
                      translateY:
                        welcomeTranslate,
                    },

                    {
                      scale: welcomeScale,
                    },
                  ],
                },
              ]}
            >
              {/* TEXT */}

              <View style={styles.welcomeText}>
                <Text style={styles.welcomeSmall}>
                  Welcome back,
                </Text>

                <Text style={styles.welcomeName}>
                  Froy Arjan
                </Text>

                <Text style={styles.welcomeMessage}>
                  Together, we respond faster{"\n"}
                  and help more.
                </Text>
              </View>

              {/* PHILIPPINE RESPONDER IMAGE */}

              <Image
                source={require(
                  "../../assets/images/volunserve_family_ph_flag.png"
                )}
                style={styles.heroImage}
                resizeMode="contain"
              />

              {/* SYSTEM STATUS */}

              <View style={styles.statusBar}>
                <View style={styles.statusLeft}>
                  <View style={styles.shieldCircle}>
                    <Ionicons
                      name="shield-checkmark"
                      size={16}
                      color="#078E73"
                    />
                  </View>

                  <Text style={styles.statusText}>
                    System Status
                  </Text>
                </View>

                <View style={styles.statusRight}>
                  <View style={styles.onlineDot} />

                  <Text
                    style={
                      styles.operationalText
                    }
                  >
                    Operational
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* =================================================
                MAIN SERVICES HEADER
            ================================================= */}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionLabel}>
                  MAIN SERVICES
                </Text>

                <Text
                  style={
                    styles.sectionDescription
                  }
                >
                  Choose the service you need
                </Text>
              </View>

              <View style={styles.serviceCount}>
                <Text
                  style={
                    styles.serviceCountText
                  }
                >
                  5 Services
                </Text>
              </View>
            </View>

            {/* =================================================
                EMERGENCY
            ================================================= */}

            <ServiceCard
              delay={300}
              glassDelay={0}
              identity="EMERGENCY"
              icon="warning"
              title="Report a Disaster"
              description="Report hazards and emergencies in your area."
              iconGradient={[
                "#FF7882",
                "#FF3E4D",
                "#E92338",
              ]}
              cardGradient={[
                "#FFFFFF",
                "#FFF7F8",
                "#FFD4DB",
              ]}
              accentColor="#EF3340"
              badgeColor="#FFE3E7"
              onPress={() =>
                router.push("/disaster-response")
              }
            />

            {/* =================================================
                ASSISTANCE
            ================================================= */}

            <ServiceCard
              delay={390}
              glassDelay={700}
              identity="ASSISTANCE"
              icon="hand-left"
              title="Request Assistance"
              description="Request help for you or someone in need."
              iconGradient={[
                "#FFC25B",
                "#FF9C1F",
                "#F47A00",
              ]}
              cardGradient={[
                "#FFFFFF",
                "#FFFAF1",
                "#FFE0A4",
              ]}
              accentColor="#F28C13"
              badgeColor="#FFF0D5"
              onPress={() =>
                router.push("/resident")
              }
            />

            {/* =================================================
                COMMUNITY
            ================================================= */}

            <ServiceCard
              delay={480}
              glassDelay={1400}
              identity="COMMUNITY"
              icon="people"
              title="Volunteer Events"
              description="Join events and make a difference."
              iconGradient={[
                "#48DA92",
                "#14BA6E",
                "#038F56",
              ]}
              cardGradient={[
                "#FFFFFF",
                "#F5FFF9",
                "#C9F6DA",
              ]}
              accentColor="#0BA861"
              badgeColor="#DCF8E9"
              onPress={() =>
                router.push("/volunteer")
              }
            />

            {/* =================================================
                MONITORING
            ================================================= */}

            <ServiceCard
              delay={570}
              glassDelay={2100}
              identity="MONITORING"
              icon="map"
              title="Map Tracking"
              description="View incidents and response zones in real-time."
              iconGradient={[
                "#62BBFA",
                "#2795E5",
                "#0873C5",
              ]}
              cardGradient={[
                "#FFFFFF",
                "#F3FAFF",
                "#CEE8FF",
              ]}
              accentColor="#218FDB"
              badgeColor="#DDF2FF"
              onPress={() =>
                router.push("/map-tracking")
              }
            />

            {/* =================================================
                SUPPORT
            ================================================= */}

            <ServiceCard
              delay={660}
              glassDelay={2800}
              identity="SUPPORT"
              icon="heart"
              title="Make a Donation"
              description="Support relief efforts and community programs."
              iconGradient={[
                "#FF7D86",
                "#FF4656",
                "#EB2639",
              ]}
              cardGradient={[
                "#FFFFFF",
                "#FFF6F7",
                "#FFD6DC",
              ]}
              accentColor="#EF4855"
              badgeColor="#FFE6E9"
              onPress={() =>
                router.push("/donation")
              }
            />

            <View style={styles.bottomSpace} />
          </View>
        </ScrollView>

        {/* ====================================================
            STATUS BAR GUARD
        ==================================================== */}

        <View
          pointerEvents="none"
          style={[
            styles.statusBarGuard,
            {
              height: insets.top,
            },
          ]}
        />
      </View>

      {/* ======================================================
          SIDE DRAWER
      ====================================================== */}

      <SideDrawer
        visible={drawerOpen}
        onClose={() =>
          setDrawerOpen(false)
        }
        name="Froy Arjan"
        email=""
        role="superadmin"
      />
    </>
  );
}

/* ============================================================
   ANIMATED SERVICE CARD
============================================================ */

function ServiceCard({
  delay,
  glassDelay,
  identity,
  icon,
  title,
  description,
  iconGradient,
  cardGradient,
  accentColor,
  badgeColor,
  onPress,
}: {
  delay: number;
  glassDelay: number;

  identity: string;
  icon: any;

  title: string;
  description: string;

  iconGradient: [
    string,
    string,
    string
  ];

  cardGradient: [
    string,
    string,
    string
  ];

  accentColor: string;
  badgeColor: string;

  onPress: () => void;
}) {
  /* =========================================================
     ENTRANCE ANIMATION
  ========================================================= */

  const opacity = useRef(
    new Animated.Value(0)
  ).current;

  const translateY = useRef(
    new Animated.Value(28)
  ).current;

  const entryScale = useRef(
    new Animated.Value(0.97)
  ).current;

  /* =========================================================
     PRESS ANIMATION
  ========================================================= */

  const pressScale = useRef(
    new Animated.Value(1)
  ).current;

  /* =========================================================
     GLASS REFLECTION
  ========================================================= */

  const shinePosition = useRef(
    new Animated.Value(0)
  ).current;

  const shineOpacity = useRef(
    new Animated.Value(0)
  ).current;

  /* =========================================================
     ICON GLOW DURING SHINE
  ========================================================= */

  const iconShine = useRef(
    new Animated.Value(0)
  ).current;

  /* =========================================================
     ENTRANCE
  ========================================================= */

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay,
        easing: Easing.out(
          Easing.cubic
        ),
        useNativeDriver: true,
      }),

      Animated.spring(translateY, {
        toValue: 0,
        delay,
        damping: 17,
        stiffness: 115,
        mass: 0.8,
        useNativeDriver: true,
      }),

      Animated.spring(entryScale, {
        toValue: 1,
        delay,
        damping: 17,
        stiffness: 115,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  /* =========================================================
     GLASS SHINE LOOP
  ========================================================= */

  useEffect(() => {
    const glassAnimation = Animated.loop(
      Animated.sequence([
        /*
          Initial delay.
          Different on each module para hindi sabay.
        */

        Animated.delay(
          1700 + glassDelay
        ),

        /*
          Turn on shine
        */

        Animated.parallel([
          Animated.timing(
            shineOpacity,
            {
              toValue: 1,
              duration: 180,
              easing:
                Easing.out(
                  Easing.quad
                ),
              useNativeDriver: true,
            }
          ),

          Animated.timing(
            iconShine,
            {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }
          ),
        ]),

        /*
          Sweep left -> right
        */

        Animated.timing(
          shinePosition,
          {
            toValue: 1,
            duration: 1050,

            easing:
              Easing.inOut(
                Easing.cubic
              ),

            useNativeDriver: true,
          }
        ),

        /*
          Fade reflection
        */

        Animated.parallel([
          Animated.timing(
            shineOpacity,
            {
              toValue: 0,
              duration: 220,
              useNativeDriver: true,
            }
          ),

          Animated.timing(
            iconShine,
            {
              toValue: 0,
              duration: 350,
              useNativeDriver: true,
            }
          ),
        ]),

        /*
          Reset shine to left
        */

        Animated.timing(
          shinePosition,
          {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }
        ),

        /*
          Rest before next reflection
        */

        Animated.delay(3600),
      ])
    );

    glassAnimation.start();

    return () => {
      glassAnimation.stop();
    };
  }, []);

  /* =========================================================
     PRESS HANDLERS
  ========================================================= */

  const handlePressIn = () => {
    Animated.spring(
      pressScale,
      {
        toValue: 0.975,
        damping: 16,
        stiffness: 220,
        useNativeDriver: true,
      }
    ).start();
  };

  const handlePressOut = () => {
    Animated.spring(
      pressScale,
      {
        toValue: 1,
        damping: 14,
        stiffness: 190,
        useNativeDriver: true,
      }
    ).start();
  };

  /* =========================================================
     GLASS INTERPOLATION
  ========================================================= */

  const shineTranslateX =
    shinePosition.interpolate({
      inputRange: [0, 1],

      outputRange: [
        -150,
        SCREEN_WIDTH + 100,
      ],
    });

  const iconGlowScale =
    iconShine.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.045],
    });

  const iconGlowOpacity =
    iconShine.interpolate({
      inputRange: [0, 1],
      outputRange: [0.25, 0.72],
    });

  return (
    /* =======================================================
       CARD ENTRANCE
    ======================================================= */

    <Animated.View
      style={{
        opacity,

        transform: [
          {
            translateY,
          },

          {
            scale: entryScale,
          },
        ],
      }}
    >
      {/* =====================================================
          PRESS ANIMATION
      ===================================================== */}

      <Animated.View
        style={{
          transform: [
            {
              scale: pressScale,
            },
          ],
        }}
      >
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.serviceOuter}
        >
          {/* LEFT ACCENT */}

          <View
            style={[
              styles.leftAccent,

              {
                backgroundColor:
                  accentColor,
              },
            ]}
          />

          {/* =================================================
              MAIN CARD
          ================================================= */}

          <LinearGradient
            colors={cardGradient}
            locations={[
              0,
              0.58,
              1,
            ]}
            start={{
              x: 0,
              y: 0,
            }}
            end={{
              x: 1,
              y: 1,
            }}
            style={styles.serviceCard}
          >
            {/* =================================================
                BACKGROUND GLOW
            ================================================= */}

            <View
              style={[
                styles.moduleGlow,

                {
                  backgroundColor:
                    `${accentColor}14`,
                },
              ]}
            />

            {/* =================================================
                DECORATIVE WAVES
            ================================================= */}

            <View
              style={[
                styles.waveLarge,

                {
                  borderColor:
                    `${accentColor}30`,
                },
              ]}
            />

            <View
              style={[
                styles.waveSmall,

                {
                  borderColor:
                    `${accentColor}20`,
                },
              ]}
            />

            {/* =================================================
                SMALL DECORATIVE SPARKLES
            ================================================= */}

            <Ionicons
              name="sparkles"
              size={15}
              color={`${accentColor}78`}
              style={styles.sparkleOne}
            />

            <Ionicons
              name="sparkles"
              size={10}
              color={`${accentColor}55`}
              style={styles.sparkleTwo}
            />

            {/* =================================================
                ICON
            ================================================= */}

            <Animated.View
              style={[
                styles.iconAnimatedWrapper,

                {
                  transform: [
                    {
                      scale:
                        iconGlowScale,
                    },
                  ],
                },
              ]}
            >
              {/* ICON OUTER GLOW */}

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.iconOuterGlow,

                  {
                    opacity:
                      iconGlowOpacity,

                    backgroundColor:
                      `${accentColor}55`,
                  },
                ]}
              />

              <LinearGradient
                colors={iconGradient}
                start={{
                  x: 0,
                  y: 0,
                }}
                end={{
                  x: 1,
                  y: 1,
                }}
                style={
                  styles.serviceIcon
                }
              >
                <View
                  style={styles.iconGlow}
                />

                <Ionicons
                  name={icon}
                  size={35}
                  color="#FFFFFF"
                />

                <Ionicons
                  name="sparkles"
                  size={11}
                  color="rgba(255,255,255,0.84)"
                  style={
                    styles.iconSparkle
                  }
                />
              </LinearGradient>
            </Animated.View>

            {/* =================================================
                CARD TEXT
            ================================================= */}

            <View
              style={
                styles.serviceContent
              }
            >
              {/* IDENTITY LABEL */}

              <View
                style={[
                  styles.identityBadge,

                  {
                    backgroundColor:
                      badgeColor,
                  },
                ]}
              >
                <View
                  style={[
                    styles.identityDot,

                    {
                      backgroundColor:
                        accentColor,
                    },
                  ]}
                />

                <Text
                  style={[
                    styles.identityText,

                    {
                      color:
                        accentColor,
                    },
                  ]}
                >
                  {identity}
                </Text>
              </View>

              {/* TITLE */}

              <Text
                style={
                  styles.serviceTitle
                }
              >
                {title}
              </Text>

              {/* DESCRIPTION */}

              <Text
                style={
                  styles.serviceDescription
                }
              >
                {description}
              </Text>
            </View>

            {/* =================================================
                ARROW
            ================================================= */}

            <View
              style={
                styles.arrowCircle
              }
            >
              <Ionicons
                name="chevron-forward"
                size={25}
                color="#10213B"
              />
            </View>

            {/* =================================================
                GLASS SHINE LAYER
            ================================================= */}

            <Animated.View
              pointerEvents="none"
              style={[
                styles.glassShine,

                {
                  opacity:
                    shineOpacity,

                  transform: [
                    {
                      translateX:
                        shineTranslateX,
                    },

                    {
                      rotate:
                        "-15deg",
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={[
                  "rgba(255,255,255,0)",
                  "rgba(255,255,255,0.06)",
                  "rgba(255,255,255,0.24)",
                  "rgba(255,255,255,0.48)",
                  "rgba(255,255,255,0.24)",
                  "rgba(255,255,255,0.06)",
                  "rgba(255,255,255,0)",
                ]}
                locations={[
                  0,
                  0.15,
                  0.32,
                  0.5,
                  0.68,
                  0.85,
                  1,
                ]}
                start={{
                  x: 0,
                  y: 0,
                }}
                end={{
                  x: 1,
                  y: 0,
                }}
                style={
                  styles.glassGradient
                }
              />
            </Animated.View>

            {/* =================================================
                SECOND SOFT GLASS LINE
            ================================================= */}

            <Animated.View
              pointerEvents="none"
              style={[
                styles.glassThinLine,

                {
                  opacity:
                    shineOpacity,

                  transform: [
                    {
                      translateX:
                        shineTranslateX,
                    },

                    {
                      rotate:
                        "-15deg",
                    },
                  ],
                },
              ]}
            />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({
  /* ==========================================================
     ROOT
  ========================================================== */

  root: {
    flex: 1,

    backgroundColor: "#F4F9FB",

    position: "relative",
  },

  scrollView: {
    flex: 1,

    backgroundColor: "#F4F9FB",
  },

  scrollContent: {
    paddingBottom: 0,
  },

  /* ==========================================================
     HEADER
  ========================================================== */

  safeHeader: {
    backgroundColor: "#7A1723",
  },

  header: {
    minHeight: 155,

    paddingHorizontal: 18,

    paddingTop: 8,
    paddingBottom: 50,

    justifyContent: "center",

    overflow: "hidden",
  },

  headerContent: {
    width: "100%",

    flexDirection: "row",

    alignItems: "center",
    justifyContent: "space-between",
  },

  headerGlowLeft: {
    position: "absolute",

    width: 250,
    height: 250,

    borderRadius: 125,

    left: -135,
    bottom: -170,

    backgroundColor:
      "rgba(255,255,255,0.07)",
  },

  headerGlowRight: {
    position: "absolute",

    width: 230,
    height: 230,

    borderRadius: 115,

    right: -95,
    top: -115,

    backgroundColor:
      "rgba(255,255,255,0.09)",
  },

  headerLight: {
    ...StyleSheet.absoluteFillObject,
  },

  /* ==========================================================
     BRAND
  ========================================================== */

  brand: {
    flex: 1,

    flexDirection: "row",

    alignItems: "center",

    zIndex: 5,
  },

  logo: {
    width: 54,
    height: 54,

    borderRadius: 27,

    marginRight: 11,

    backgroundColor: "#FFFFFF",
  },

  brandText: {
    flex: 1,

    paddingRight: 4,
  },

  brandTitle: {
    color: "#FFFFFF",

    fontSize: 25,
    lineHeight: 28,

    fontWeight: "800",

    letterSpacing: -0.5,
  },

  brandSubtitle: {
    color: "#FFE9EB",

    fontSize: 11.5,
    lineHeight: 15,

    marginTop: 2,
  },

  /* ==========================================================
     HEADER ACTIONS
  ========================================================== */

  headerActions: {
    flexDirection: "row",

    alignItems: "center",

    gap: 3,

    zIndex: 5,
  },

  headerButton: {
    width: 42,
    height: 42,

    alignItems: "center",
    justifyContent: "center",

    position: "relative",
  },

  headerPressed: {
    opacity: 0.65,
  },

  notificationDot: {
    position: "absolute",

    top: 3,
    right: 3,

    width: 9,
    height: 9,

    borderRadius: 5,

    backgroundColor: "#FFD54A",

    borderWidth: 1.5,

    borderColor: "#B91C2C",
  },

  /* ==========================================================
     BODY
  ========================================================== */

  body: {
    backgroundColor: "#F4F9FB",

    paddingHorizontal: 14,

    paddingBottom: 20,
  },

  /* ==========================================================
     WELCOME CARD
  ========================================================== */

  welcomeCard: {
    height: 210,

    backgroundColor: "#FFFFFF",

    borderRadius: 26,

    marginTop: -44,
    marginBottom: 28,

    paddingHorizontal: 20,
    paddingTop: 20,

    position: "relative",

    overflow: "hidden",

    borderWidth: 1,

    borderColor: "#E5ECEF",

    shadowColor: "#102238",

    shadowOffset: {
      width: 0,
      height: 5,
    },

    shadowOpacity: 0.11,
    shadowRadius: 11,

    elevation: 8,
  },

  welcomeText: {
    width: "49%",

    zIndex: 5,
  },

  welcomeSmall: {
    color: "#54647B",

    fontSize: 13.5,
    lineHeight: 18,
  },

  welcomeName: {
    color: "#0B1E38",

    fontSize: 27,
    lineHeight: 32,

    fontWeight: "800",

    letterSpacing: -0.6,

    marginTop: 2,
  },

  welcomeMessage: {
    color: "#5B6B82",

    fontSize: 13.5,
    lineHeight: 19,

    marginTop: 9,
  },

  heroImage: {
    position: "absolute",

    right: 12,
    top: 18,

    width: 170,
    height: 112,
  },

  /* ==========================================================
     SYSTEM STATUS
  ========================================================== */

  statusBar: {
    position: "absolute",

    left: 20,
    right: 20,
    bottom: 16,

    height: 47,

    borderRadius: 16,

    backgroundColor: "#EAF9F5",

    paddingHorizontal: 14,

    flexDirection: "row",

    alignItems: "center",
    justifyContent: "space-between",
  },

  statusLeft: {
    flexDirection: "row",

    alignItems: "center",
  },

  shieldCircle: {
    width: 30,
    height: 30,

    borderRadius: 15,

    backgroundColor: "#D4F3E9",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 8,
  },

  statusText: {
    color: "#243751",

    fontSize: 13.5,

    fontWeight: "700",
  },

  statusRight: {
    flexDirection: "row",

    alignItems: "center",
  },

  onlineDot: {
    width: 8,
    height: 8,

    borderRadius: 4,

    backgroundColor: "#0CAD64",

    marginRight: 6,
  },

  operationalText: {
    color: "#078F62",

    fontSize: 13.5,

    fontWeight: "700",
  },

  /* ==========================================================
     SECTION HEADER
  ========================================================== */

  sectionHeader: {
    flexDirection: "row",

    alignItems: "flex-end",
    justifyContent: "space-between",

    paddingHorizontal: 3,

    marginBottom: 14,
  },

  sectionLabel: {
    color: "#078D81",

    fontSize: 14,

    fontWeight: "800",

    letterSpacing: 0.7,
  },

  sectionDescription: {
    color: "#8190A1",

    fontSize: 10.5,

    marginTop: 3,
  },

  serviceCount: {
    backgroundColor: "#E4F7F3",

    borderRadius: 14,

    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  serviceCountText: {
    color: "#078D81",

    fontSize: 10,

    fontWeight: "700",
  },

  /* ==========================================================
     SERVICE CARD
  ========================================================== */

  serviceOuter: {
    minHeight: 126,

    borderRadius: 23,

    marginBottom: 18,

    position: "relative",

    backgroundColor: "#FFFFFF",

    shadowColor: "#14253D",

    shadowOffset: {
      width: 0,
      height: 4,
    },

    shadowOpacity: 0.085,
    shadowRadius: 9,

    elevation: 4,
  },

  leftAccent: {
    position: "absolute",

    left: 0,

    top: 15,
    bottom: 15,

    width: 6,

    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,

    zIndex: 40,

    elevation: 40,
  },

  serviceCard: {
    minHeight: 126,

    borderRadius: 23,

    flexDirection: "row",

    alignItems: "center",

    paddingLeft: 26,
    paddingRight: 17,

    paddingVertical: 16,

    overflow: "hidden",

    borderWidth: 1,

    borderColor:
      "rgba(214,225,232,0.68)",
  },

  /* ==========================================================
     ICON WRAPPER
  ========================================================== */

  iconAnimatedWrapper: {
    width: 68,
    height: 68,

    marginRight: 18,

    position: "relative",

    alignItems: "center",
    justifyContent: "center",

    zIndex: 15,
  },

  iconOuterGlow: {
    position: "absolute",

    width: 72,
    height: 72,

    borderRadius: 23,

    top: -2,
    left: -2,

    transform: [
      {
        scale: 1.08,
      },
    ],
  },

  serviceIcon: {
    width: 68,
    height: 68,

    borderRadius: 20,

    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000000",

    shadowOffset: {
      width: 0,
      height: 4,
    },

    shadowOpacity: 0.16,
    shadowRadius: 7,

    elevation: 5,

    position: "relative",

    overflow: "hidden",
  },

  iconGlow: {
    position: "absolute",

    width: 58,
    height: 29,

    borderRadius: 29,

    top: -9,
    left: -8,

    backgroundColor:
      "rgba(255,255,255,0.16)",
  },

  iconSparkle: {
    position: "absolute",

    top: 7,
    right: 7,
  },

  /* ==========================================================
     SERVICE TEXT
  ========================================================== */

  serviceContent: {
    flex: 1,

    paddingRight: 5,

    zIndex: 12,
  },

  identityBadge: {
    alignSelf: "flex-start",

    minHeight: 21,

    borderRadius: 11,

    paddingHorizontal: 7,

    flexDirection: "row",

    alignItems: "center",

    marginBottom: 5,
  },

  identityDot: {
    width: 5,
    height: 5,

    borderRadius: 3,

    marginRight: 5,
  },

  identityText: {
    fontSize: 9,

    fontWeight: "800",

    letterSpacing: 0.65,
  },

  serviceTitle: {
    color: "#0E213D",

    fontSize: 18,
    lineHeight: 21,

    fontWeight: "800",

    letterSpacing: -0.25,

    marginBottom: 4,
  },

  serviceDescription: {
    color: "#556B87",

    fontSize: 12.5,
    lineHeight: 17,
  },

  /* ==========================================================
     ARROW
  ========================================================== */

  arrowCircle: {
    width: 48,
    height: 48,

    borderRadius: 24,

    backgroundColor:
      "rgba(255,255,255,0.93)",

    alignItems: "center",
    justifyContent: "center",

    marginLeft: 7,

    borderWidth: 1,

    borderColor:
      "rgba(255,255,255,0.98)",

    shadowColor: "#76849A",

    shadowOffset: {
      width: 0,
      height: 2,
    },

    shadowOpacity: 0.06,
    shadowRadius: 4,

    elevation: 2,

    zIndex: 12,
  },

  /* ==========================================================
     CARD BACKGROUND DECORATIONS
  ========================================================== */

  moduleGlow: {
    position: "absolute",

    width: 250,
    height: 145,

    borderRadius: 130,

    right: -82,
    bottom: -80,
  },

  waveLarge: {
    position: "absolute",

    width: 285,
    height: 100,

    borderRadius: 155,

    borderTopWidth: 1.4,

    right: -42,
    bottom: -63,

    transform: [
      {
        rotate: "-5deg",
      },
    ],
  },

  waveSmall: {
    position: "absolute",

    width: 245,
    height: 88,

    borderRadius: 135,

    borderTopWidth: 1,

    right: -18,
    bottom: -67,

    transform: [
      {
        rotate: "4deg",
      },
    ],
  },

  sparkleOne: {
    position: "absolute",

    right: 86,
    bottom: 22,

    zIndex: 5,
  },

  sparkleTwo: {
    position: "absolute",

    right: 44,
    top: 19,

    zIndex: 5,
  },

  /* ==========================================================
     GLASS ANIMATION
  ========================================================== */

  glassShine: {
    position: "absolute",

    top: -55,
    bottom: -55,

    width: 105,

    zIndex: 30,

    overflow: "hidden",
  },

  glassGradient: {
    flex: 1,

    width: "100%",
    height: "100%",

    borderRadius: 40,
  },

  glassThinLine: {
    position: "absolute",

    top: -55,
    bottom: -55,

    width: 2,

    backgroundColor:
      "rgba(255,255,255,0.55)",

    zIndex: 31,

    shadowColor: "#FFFFFF",

    shadowOffset: {
      width: 0,
      height: 0,
    },

    shadowOpacity: 0.45,
    shadowRadius: 7,
  },

  /* ==========================================================
     BOTTOM SPACE
  ========================================================== */

  bottomSpace: {
    height: 10,
  },

  /* ==========================================================
     STATUS BAR GUARD
  ========================================================== */

  statusBarGuard: {
    position: "absolute",

    top: 0,
    left: 0,
    right: 0,

    backgroundColor: "#7A1723",

    zIndex: 9999,

    elevation: 9999,
  },
});