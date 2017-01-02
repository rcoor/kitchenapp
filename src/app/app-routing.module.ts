import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TalentsPageComponent } from './talents-page/talents-page.component';
import { AddTalentComponent } from './add-talent/add-talent.component';

const appRoutes: Routes = [
    { path: '', component: TalentsPageComponent },
    { path: 'add', component: AddTalentComponent }
];
@NgModule({
    imports: [
        RouterModule.forRoot(appRoutes)
    ],
    exports: [
        RouterModule
    ]
})
export class AppRoutingModule { }
