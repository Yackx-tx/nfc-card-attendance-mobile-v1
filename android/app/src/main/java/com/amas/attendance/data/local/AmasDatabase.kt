package com.amas.attendance.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        CachedRosterEntity::class,
        OfflineAuthorizationEntity::class,
        OutboxEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AmasDatabase : RoomDatabase() {
    abstract fun rosterDao(): RosterDao
    abstract fun authorizationDao(): AuthorizationDao
    abstract fun outboxDao(): OutboxDao

    companion object {
        @Volatile
        private var INSTANCE: AmasDatabase? = null

        fun getInstance(context: Context): AmasDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AmasDatabase::class.java,
                    "amas_attendance_offline.db"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}
