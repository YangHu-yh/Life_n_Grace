import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import { cards, Card } from './src/data/cards';

export default function App() {
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  const drawCard = () => {
    // Reset animation
    fadeAnim.setValue(0);
    
    // Select random card
    const randomIndex = Math.floor(Math.random() * cards.length);
    const newCard = cards[randomIndex];
    
    // Animate the card appearance
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    setCurrentCard(newCard);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Grace To Grace</Text>
      <Text style={styles.subtitle}>Draw a Card</Text>
      
      <View style={styles.cardContainer}>
        {currentCard ? (
          <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
            <Text style={styles.cardId}>{currentCard.id}</Text>
            <Text style={styles.cardTitle}>{currentCard.title}</Text>
          </Animated.View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No card drawn yet</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={drawCard}>
        <Text style={styles.buttonText}>Draw a Card</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 40,
  },
  cardContainer: {
    width: '100%',
    height: 200,
    marginBottom: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '80%',
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  emptyCard: {
    width: '80%',
    height: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCardText: {
    color: '#666',
    fontSize: 16,
  },
  cardId: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
}); 