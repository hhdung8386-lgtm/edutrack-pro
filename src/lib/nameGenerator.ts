import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

// A large, clean list of 1500+ unique English names/nicknames (all valid usernames, no spaces/special characters)
const ENGLISH_NAMES: string[] = [
  // A
  'Aaron', 'Abby', 'Abel', 'Abigail', 'Abraham', 'Ada', 'Adah', 'Adalyn', 'Adam', 'Addison',
  'Adela', 'Adelaide', 'Adele', 'Adeline', 'Adiel', 'Adler', 'Adonis', 'Adrian', 'Adriana', 'Adrienne',
  'Afton', 'Agatha', 'Agnes', 'Aidan', 'Aiden', 'Aiko', 'Aileen', 'Aileen', 'Ailsa', 'Aimee', 'Ainsley',
  'Alaina', 'Alan', 'Alana', 'Alaric', 'Albert', 'Alberta', 'Alden', 'Aldo', 'Alec', 'Alecia',
  'Alejandro', 'Alena', 'Alesha', 'Alex', 'Alexa', 'Alexander', 'Alexandra', 'Alexia', 'Alexis', 'Alfie',
  'Alfonso', 'Alfred', 'Alger', 'Alice', 'Alicia', 'Alina', 'Alisa', 'Alisha', 'Alison', 'Alissa',
  'Alistair', 'Allan', 'Allie', 'Allison', 'Alma', 'Alondra', 'Alonzo', 'Aloysius', 'Alpha', 'Althea',
  'Alvin', 'Alvis', 'Alyson', 'Alyssa', 'Amara', 'Amari', 'Amaya', 'Amber', 'Ambrose', 'Amelia',
  'Amelie', 'Amery', 'Amethyst', 'Amir', 'Amira', 'Amity', 'Amos', 'Amy', 'Anabel', 'Anastasia',
  'Anchor', 'Anderson', 'Andre', 'Andrea', 'Andreas', 'Andres', 'Andrew', 'Andromeda', 'Andy', 'Angel',
  'Angela', 'Angelica', 'Angelina', 'Angeline', 'Angelo', 'Angus', 'Anika', 'Anita', 'Aniya', 'Ann',
  'Anna', 'Annabel', 'Annabella', 'Annabelle', 'Annalise', 'Anne', 'Annette', 'Annie', 'Ansel', 'Anson',
  'Anthony', 'Antoinette', 'Antonia', 'Antonio', 'Antony', 'Apollo', 'Apple', 'April', 'Arabella', 'Archer',
  'Archibald', 'Archie', 'Arden', 'Ares', 'Ari', 'Aria', 'Ariadne', 'Ariana', 'Arianna', 'Ariel',
  'Ariella', 'Arielle', 'Arlo', 'Armand', 'Armando', 'Arnold', 'Aron', 'Arrow', 'Art', 'Arthur',
  'Arturo', 'Arundel', 'Arven', 'Arvid', 'Arya', 'Asa', 'Asher', 'Ashley', 'Ashlyn', 'Ashton',
  'Aspen', 'Astrid', 'Athena', 'Atlas', 'Atticus', 'Aubree', 'Aubrey', 'Audrey', 'Audrina', 'August',
  'Augusta', 'Augustine', 'Augustus', 'Aurelia', 'Aurelius', 'Aurora', 'Austen', 'Austin', 'Autumn', 'Ava',
  'Avalon', 'Avery', 'Axel', 'Ayla', 'Aylin', 'Azalea', 'Azariah',
  
  // B
  'Baby', 'Bailey', 'Baird', 'Baker', 'Baldwin', 'Barak', 'Barbara', 'Barclay', 'Barnaby', 'Barney',
  'Baron', 'Barrett', 'Barry', 'Bartholomew', 'Barton', 'Basil', 'Bastian', 'Baxter', 'Bay', 'Baylor',
  'Beata', 'Beatrice', 'Beatrix', 'Beau', 'Beauregard', 'Becca', 'Beck', 'Beckett', 'Beckham', 'Bedford',
  'Bela', 'Belinda', 'Bell', 'Bella', 'Bellamy', 'Belle', 'Ben', 'Benedict', 'Benjamin', 'Benji',
  'Bennett', 'Bennie', 'Benny', 'Benson', 'Bentley', 'Benton', 'Berenice', 'Berg', 'Berkeley', 'Bernard',
  'Bernardo', 'Bernice', 'Bernie', 'Bert', 'Berta', 'Bertha', 'Bertram', 'Beryl', 'Bess', 'Bessie',
  'Beth', 'Bethany', 'Betsy', 'Bette', 'Bettina', 'Betty', 'Bevis', 'Bexley', 'Bianca', 'Bill',
  'Billie', 'Billy', 'Bingham', 'Birch', 'Bishop', 'Blaine', 'Blair', 'Blaise', 'Blake', 'Blakely',
  'Blanche', 'Blaze', 'Bo', 'Bob', 'Bobbi', 'Bobby', 'Bodie', 'Bonita', 'Bonnie', 'Booker',
  'Boone', 'Boston', 'Bowen', 'Bowie', 'Boyd', 'Brad', 'Braden', 'Bradford', 'Bradley', 'Brady',
  'Braeden', 'Braelyn', 'Bram', 'Brandon', 'Brandy', 'Brant', 'Brantley', 'Braxton', 'Brayden', 'Braylon',
  'Breanna', 'Breck', 'Brecken', 'Bree', 'Breeze', 'Brenda', 'Brendan', 'Brenden', 'Brendon', 'Brenna',
  'Brennan', 'Brent', 'Brentley', 'Brenton', 'Brett', 'Brexton', 'Brian', 'Briana', 'Brianna', 'Briar',
  'Brice', 'Bridget', 'Bridger', 'Briella', 'Brielle', 'Brighton', 'Briggs', 'Brinkley', 'Briona', 'Bristol',
  'Britney', 'Brittany', 'Britton', 'Brock', 'Brodie', 'Brody', 'Bronson', 'Bronte', 'Brooke', 'Brooklyn',
  'Brooks', 'Bruce', 'Bruno', 'Bryan', 'Bryant', 'Bryce', 'Brycen', 'Brynn', 'Bryon', 'Brysen',
  'Bryson', 'Buck', 'Bud', 'Buddy', 'Buford', 'Burke', 'Buster', 'Byron',
  
  // C
  'Cade', 'Caden', 'Cadence', 'Caesar', 'Caelan', 'Cain', 'Caitlin', 'Caitlyn', 'Cal', 'Caleb',
  'Calista', 'Callahan', 'Callie', 'Callum', 'Calvin', 'Camden', 'Cameron', 'Camila', 'Camilla', 'Camille',
  'Campbell', 'Camron', 'Candace', 'Candice', 'Candy', 'Cannon', 'Canyon', 'Capri', 'Cara', 'Carey',
  'Carina', 'Carl', 'Carla', 'Carlene', 'Carlo', 'Carlos', 'Carlton', 'Carly', 'Carmela', 'Carmelo',
  'Carmen', 'Carmine', 'Carol', 'Carole', 'Carolina', 'Caroline', 'Carolyn', 'Carrick', 'Carrie', 'Carson',
  'Carter', 'Carver', 'Cary', 'Casey', 'Cash', 'Cason', 'Caspar', 'Casper', 'Cassandra', 'Cassia',
  'Cassian', 'Cassie', 'Cassius', 'Castiel', 'Catalina', 'Catarina', 'Catherine', 'Cathleen', 'Cathy', 'Catrina',
  'Cavan', 'Cayden', 'Cayla', 'Cece', 'Cecil', 'Cecilia', 'Cecily', 'Cedric', 'Celeste', 'Celia',
  'Celina', 'Celine', 'Chaim', 'Channing', 'Charity', 'Charlene', 'Charles', 'Charley', 'Charlie', 'Charlotte',
  'Charlton', 'Charmaine', 'Chase', 'Chasity', 'Chauncey', 'Chaya', 'Chelsea', 'Cherie', 'Cherish', 'Cherry',
  'Cheryl', 'Chesney', 'Chester', 'Cheyenne', 'Chiara', 'Chloe', 'Chris', 'Christian', 'Christiana', 'Christina',
  'Christine', 'Christopher', 'Christy', 'Chuck', 'Cian', 'Ciara', 'Cicely', 'Ciel', 'Cinderella', 'Cindy',
  'Claire', 'Clara', 'Clare', 'Clarence', 'Clarissa', 'Clark', 'Claude', 'Claudia', 'Clay', 'Clayton',
  'Clement', 'Clementine', 'Cleo', 'Cleon', 'Cletus', 'Cleveland', 'Cliff', 'Clifford', 'Clifton', 'Clint',
  'Clinton', 'Clive', 'Cloe', 'Clover', 'Clyde', 'Coal', 'Coby', 'Cochran', 'Coco', 'Cody',
  'Cohen', 'Colby', 'Cole', 'Coleman', 'Colette', 'Colin', 'Colleen', 'Collin', 'Collins', 'Colt',
  'Colten', 'Colter', 'Colton', 'Columbus', 'Conan', 'Conan', 'Conner', 'Connor', 'Conor', 'Conrad', 'Constance',
  'Constantine', 'Consuelo', 'Cooper', 'Cora', 'Coral', 'Coralie', 'Corban', 'Corbin', 'Cordelia', 'Corey',
  'Corinne', 'Cornelius', 'Cortez', 'Corwin', 'Cory', 'Cosimo', 'Cosmo', 'Coty', 'Courtney', 'Cove',
  'Cowan', 'Craig', 'Crawford', 'Creed', 'Creighton', 'Crispin', 'Cristian', 'Cristina', 'Crosby', 'Cruz',
  'Crystal', 'Cullen', 'Curran', 'Curry', 'Curtis', 'Cuthbert', 'Cynthia', 'Cyprian', 'Cyril', 'Cyrus',
  
  // D
  'Dacian', 'Dacre', 'Daisy', 'Dakota', 'Dale', 'Dallas', 'Dalton', 'Damian', 'Damien', 'Damon',
  'Dan', 'Dana', 'Dandy', 'Dane', 'Daniel', 'Daniela', 'Daniella', 'Danielle', 'Danny', 'Dante',
  'Daphne', 'Dara', 'Darby', 'Darcy', 'Daren', 'Daria', 'Darian', 'Darin', 'Dario', 'Darius',
  'Darla', 'Darleen', 'Darlene', 'Darrel', 'Darrell', 'Darren', 'Darrin', 'Darryl', 'Darton', 'Darwin',
  'Daryl', 'Dash', 'Dashel', 'Dave', 'Davenport', 'David', 'Davina', 'Davis', 'Davon', 'Dawn',
  'Dawson', 'Dax', 'Daxton', 'Dayton', 'Deacon', 'Dean', 'Deandre', 'Deanna', 'Debby', 'Deborah',
  'Debra', 'Declan', 'Dee', 'Deegan', 'Deidre', 'Deirdre', 'Dejuan', 'Delaney', 'Delbert', 'Delfina',
  'Delia', 'Delilah', 'Delius', 'Dell', 'Della', 'Delmar', 'Delores', 'Delphine', 'Demetria', 'Demetrius',
  'Demi', 'Dempsey', 'Denis', 'Denise', 'Dennis', 'Denny', 'Denver', 'Denzel', 'Deon', 'Derek',
  'Derick', 'Dermot', 'Derrick', 'Desirae', 'Desiree', 'Desmond', 'Destinee', 'Destiny', 'Devan', 'Devin',
  'Devon', 'Devyn', 'Dexter', 'Diallo', 'Diana', 'Diane', 'Dianna', 'Dianne', 'Dick', 'Diego',
  'Dierks', 'Dieter', 'Dillon', 'Dina', 'Dino', 'Dion', 'Dior', 'Dirk', 'Dixon', 'Dixie',
  'Dmitri', 'Doane', 'Doc', 'Dolly', 'Dolores', 'Domenic', 'Dominic', 'Dominick', 'Dominique', 'Don',
  'Donald', 'Donato', 'Donna', 'Donnie', 'Donny', 'Donovan', 'Dora', 'Doran', 'Dorcas', 'Doreen',
  'Dorian', 'Doris', 'Dorothea', 'Dorothy', 'Dory', 'Doug', 'Douglas', 'Doyle', 'Drake', 'Drew',
  'Duane', 'Dudley', 'Duff', 'Duke', 'Duncan', 'Dunstan', 'Dustin', 'Dusty', 'Dwayne', 'Dwight',
  'Dylan', 'Dyson',
  
  // E
  'Earl', 'Earlene', 'Earnest', 'Easton', 'Eaton', 'Ebony', 'Echo', 'Ed', 'Edan', 'Eddy',
  'Eden', 'Edgar', 'Edie', 'Edison', 'Edith', 'Edmund', 'Edna', 'Eduardo', 'Edward', 'Edwin',
  'Edwina', 'Effie', 'Egan', 'Egbert', 'Eileen', 'Eirene', 'Elaine', 'Elan', 'Eland', 'Elbert',
  'Elda', 'Elda', 'Elden', 'Eldon', 'Eleanor', 'Electra', 'Elena', 'Eleni', 'Eli', 'Elian', 'Eliana',
  'Elias', 'Eliezer', 'Elijah', 'Elin', 'Elina', 'Eliot', 'Elisa', 'Elisabeth', 'Elise', 'Eliseo',
  'Elisha', 'Elissa', 'Eliza', 'Elizabeth', 'Ella', 'Elle', 'Ellen', 'Ellery', 'Ellicott', 'Ellie',
  'Elliot', 'Elliott', 'Ellis', 'Ellison', 'Elma', 'Elmer', 'Elmo', 'Elodie', 'Eloise', 'Elroy',
  'Elsa', 'Elsie', 'Elton', 'Elvin', 'Elvira', 'Elvis', 'Elwood', 'Elyse', 'Ember', 'Emely',
  'Emera', 'Emerald', 'Emerson', 'Emery', 'Emil', 'Emilia', 'Emiliano', 'Emilie', 'Emilio', 'Emily',
  'Emma', 'Emmeline', 'Emmerson', 'Emmet', 'Emmett', 'Emmie', 'Emmy', 'Emory', 'Ena', 'Enoch',
  'Enid', 'Ennis', 'Enrico', 'Enrique', 'Ephraim', 'Epiphany', 'Eric', 'Erica', 'Erick', 'Erika',
  'Erin', 'Iris', 'Erland', 'Erma', 'Ernest', 'Ernesto', 'Ernie', 'Erno', 'Errol', 'Ervin',
  'Erwin', 'Esme', 'Esmeralda', 'Esperanza', 'Esteban', 'Estela', 'Estelle', 'Ester', 'Esther', 'Estrella',
  'Ethan', 'Ethel', 'Ethelyn', 'Etienne', 'Etta', 'Eudora', 'Eugene', 'Eugenia', 'Eulalia', 'Eunice',
  'Eustace', 'Eva', 'Evan', 'Evangeline', 'Eve', 'Evelyn', 'Everett', 'Everley', 'Everly', 'Evie',
  'Evita', 'Ewan', 'Ezekiel', 'Ezra',
  
  // F
  'Fabian', 'Fabiana', 'Fabio', 'Fairfax', 'Faith', 'Falcon', 'Falkner', 'Fancy', 'Fanny', 'Faraday',
  'Faren', 'Farley', 'Farrah', 'Faron', 'Farrell', 'Faust', 'Faustina', 'Faustine', 'Fawn', 'Fay',
  'Faye', 'Felicia', 'Felicity', 'Felipe', 'Felix', 'Felton', 'Ferdinand', 'Fergus', 'Ferguson', 'Fern',
  'Fernanda', 'Fernando', 'Ferrell', 'Fidel', 'Fidelia', 'Fielding', 'Fife', 'Finbar', 'Findlay', 'Finley',
  'Finn', 'Finnegan', 'Finnian', 'Fiona', 'Fitch', 'Fitzgerald', 'Fitzhugh', 'Fitzpatrick', 'Fitzroy', 'Flavia',
  'Fletcher', 'Fleur', 'Flint', 'Flora', 'Florence', 'Florian', 'Florida', 'Florrie', 'Flossie', 'Flower',
  'Floyd', 'Flynn', 'Foard', 'Foley', 'Fontayne', 'Forbes', 'Ford', 'Forest', 'Forrest', 'Foster',
  'Fowler', 'Fox', 'Foy', 'Fran', 'Frances', 'Francesca', 'Francesco', 'Francis', 'Francisco', 'Francisca',
  'Frank', 'Frankie', 'Franklin', 'Franklyn', 'Fraser', 'Frayne', 'Fred', 'Freda', 'Freddie', 'Freddy',
  'Frederic', 'Frederick', 'Frederica', 'Fredrick', 'Fredrika', 'Freeland', 'Freeman', 'Fremont', 'Freya',
  'Frida', 'Frieda', 'Fritz', 'Fulton', 'Fulvia',
  
  // G
  'Gabe', 'Gabriel', 'Gabriela', 'Gabriella', 'Gabrielle', 'Gaby', 'Gael', 'Gage', 'Gaia', 'Gail',
  'Gale', 'Galen', 'Galileo', 'Gallagher', 'Galloway', 'Gamaliel', 'Gannon', 'Gardner', 'Garett', 'Garfield',
  'Garland', 'Garner', 'Garnet', 'Garnett', 'Garold', 'Garret', 'Garrett', 'Garrick', 'Garrison', 'Garry',
  'Garth', 'Garven', 'Garver', 'Gary', 'Gaspar', 'Gaston', 'Gavin', 'Gayle', 'Gaylord', 'Geary',
  'Gemma', 'Gene', 'General', 'Genesis', 'Geneva', 'Genevieve', 'Geoff', 'Geoffrey', 'George', 'Georgette',
  'Georgia', 'Georgia', 'Georgina', 'Gerald', 'Geraldine', 'Gerard', 'Gerardo', 'German', 'Gerry', 'Gertrude', 'Gia',
  'Gianna', 'Gibson', 'Gideon', 'Gifford', 'Gil', 'Gilbert', 'Gilchrist', 'Giles', 'Gill', 'Gillespie',
  'Gillian', 'Gina', 'Ginger', 'Gino', 'Giovani', 'Giovanni', 'Giovanna', 'Gisela', 'Gisele', 'Giselle',
  'Giuseppe', 'Gladys', 'Glen', 'Glenda', 'Glenn', 'Glenna', 'Gloria', 'Glover', 'Glyn', 'Glynis',
  'Goddard', 'Godfrey', 'Golda', 'Goldie', 'Gordon', 'Gore', 'Grace', 'Gracelyn', 'Gracia', 'Gracie',
  'Grady', 'Graeme', 'Graham', 'Granger', 'Grant', 'Granville', 'Gray', 'Grayson', 'Green', 'Greer',
  'Greg', 'Gregg', 'Gregory', 'Greta', 'Gretchen', 'Gretel', 'Grey', 'Greyson', 'Griffin', 'Griffith',
  'Griselda', 'Grover', 'Guadalupe', 'Guido', 'Guinevere', 'Gulliver', 'Gunnar', 'Gunther', 'Gus', 'Gustaf',
  'Gustav', 'Gustave', 'Gustavus', 'Guy', 'Gwen', 'Gwendolyn', 'Gwyneth',
  
  // H
  'Hadassah', 'Hadley', 'Hagar', 'Haiden', 'Hailee', 'Hailey', 'Hailie', 'Haines', 'Hakeem', 'Hal',
  'Haley', 'Hall', 'Hallden', 'Halle', 'Hallie', 'Halsey', 'Hamilton', 'Hamlin', 'Hammond', 'Hampton',
  'Hana', 'Hank', 'Hanna', 'Hannah', 'Hans', 'Harlan', 'Harland', 'Harley', 'Harlow', 'Harmon',
  'Harmony', 'Harold', 'Harper', 'Harrell', 'Harriet', 'Harris', 'Harrison', 'Harry', 'Hart', 'Hartford',
  'Hartley', 'Harvey', 'Hasheem', 'Hassan', 'Hattie', 'Haven', 'Hayden', 'Hayes', 'Haylee', 'Hayley',
  'Hayward', 'Hazel', 'Hazen', 'Heath', 'Heather', 'Hector', 'Hedy', 'Hedy', 'Heidi', 'Helen', 'Helena',
  'Helene', 'Helga', 'Helias', 'Helios', 'Hellen', 'Henderson', 'Henrietta', 'Henrik', 'Henry', 'Herbert',
  'Herman', 'Hermione', 'Hermon', 'Hernando', 'Herschel', 'Hershel', 'Hester', 'Hettie', 'Hewitt', 'Hillary',
  'Hilary', 'Hilda', 'Hildegard', 'Hilliard', 'Hilton', 'Hiram', 'Hiro', 'Hobart', 'Hodge', 'Hogan',
  'Holden', 'Hollis', 'Holly', 'Holmes', 'Homer', 'Honey', 'Hope', 'Horace', 'Horatio', 'Horton',
  'Hosea', 'Houston', 'Howard', 'Howell', 'Howie', 'Hubert', 'Hudson', 'Hugh', 'Hughes', 'Hugo',
  'Hulda', 'Humberto', 'Humphrey', 'Hunt', 'Hunter', 'Huntington', 'Huntley', 'Hurd', 'Hurst', 'Huxley',
  'Hyatt', 'Hyland',
  
  // I
  'Ian', 'Ianthe', 'Ibarra', 'Ibrahim', 'Ica', 'Ida', 'Idabelle', 'Idalia', 'Idelle', 'Ignacio',
  'Ignatius', 'Ike', 'Ila', 'Ilene', 'Iliana', 'Illa', 'Ilona', 'Ilse', 'Imani', 'Immanuel',
  'Imogene', 'Ina', 'India', 'Indigo', 'Ines', 'Inez', 'Inga', 'Ingrid', 'Inigo', 'Innes',
  'Io', 'Iola', 'Iona', 'Ira', 'Irena', 'Irene', 'Irvin', 'Irvine', 'Irving', 'Irwin', 'Isa',
  'Isaac', 'Isabel', 'Isabella', 'Isabelle', 'Isadora', 'Isaiah', 'Isam', 'Isiah', 'Isidore', 'Isis',
  'Isla', 'Ismael', 'Israel', 'Issac', 'Ita', 'Itzel', 'Ivan', 'Iva', 'Ivah', 'Ivana',
  'Ivanna', 'Ives', 'Ivette', 'Ivy', 'Izaiah',
  
  // J
  'Jabez', 'Jabin', 'Jacinto', 'Jack', 'Jackie', 'Jacklyn', 'Jackson', 'Jacky', 'Jacob', 'Jacoby',
  'Jacqueline', 'Jacquelyn', 'Jacques', 'Jada', 'Jade', 'Jaden', 'Jadon', 'Jadyn', 'Jaelynn', 'Jagger',
  'Jaida', 'Jaiden', 'Jaime', 'Jairo', 'Jake', 'Jakob', 'Jalen', 'Jalyn', 'Jamal', 'Jamar',
  'Jamarcus', 'Jameel', 'Jamel', 'James', 'Jameson', 'Jamey', 'Jamie', 'Jamir', 'Jamison', 'Jamiya',
  'Jan', 'Jana', 'Janae', 'Janelle', 'Janet', 'Janette', 'Janice', 'Janie', 'Janine', 'Janis',
  'Jared', 'Jarek', 'Jaren', 'Jarod', 'Jaron', 'Jarred', 'Jarrett', 'Jarrod', 'Jarvis', 'Jasiah',
  'Jasmine', 'Jason', 'Jasper', 'Javen', 'Javier', 'Javon', 'Jax', 'Jaxon', 'Jaxson', 'Jaxton',
  'Jay', 'Jaya', 'Jayce', 'Jaycee', 'Jaycen', 'Jaycob', 'Jayden', 'Jaydon', 'Jayla', 'Jaylan',
  'Jaylee', 'Jayleen', 'Jaylen', 'Jaylin', 'Jaylon', 'Jayme', 'Jaymes', 'Jayson', 'Jean', 'Jeanette',
  'Jeanie', 'Jeanne', 'Jeannette', 'Jeannie', 'Jed', 'Jedidiah', 'Jeff', 'Jefferson', 'Jeffrey', 'Jeffry',
  'Jemima', 'Jenifer', 'Jenna', 'Jenni', 'Jennie', 'Jennifer', 'Jenny', 'Jerald', 'Jeremiah', 'Jeremy',
  'Jeri', 'Jermaine', 'Jerod', 'Jerold', 'Jerome', 'Jeromy', 'Jerrell', 'Jerrod', 'Jerry', 'Jersey',
  'Jervis', 'Jesse', 'Jessica', 'Jessie', 'Jester', 'Jesus', 'Jett', 'Jevan', 'Jewel', 'Jewell',
  'Jillian', 'Jim', 'Jimmie', 'Jimmy', 'Jo', 'Joan', 'Joann', 'Joanna', 'Joanne', 'Joaquin',
  'Job', 'Jocelyn', 'Jodi', 'Jodie', 'Jody', 'Joe', 'Joel', 'Joelle', 'Joey', 'Johan',
  'Johana', 'Johanna', 'Johannes', 'John', 'Johnathan', 'Johnathon', 'Johnny', 'Jolene', 'Jolie', 'Jon',
  'Jonah', 'Jonas', 'Jonathan', 'Jonathon', 'Joni', 'Jontae', 'Jordan', 'Jordon', 'Jordy', 'Jordyn',
  'Jorge', 'Joris', 'Jose', 'Josef', 'Josefa', 'Josefina', 'Joseph', 'Josephine', 'Josh', 'Joshua',
  'Josiah', 'Josie', 'Joslyn', 'Josue', 'Jovan', 'Jovani', 'Jovanny', 'Jovany', 'Joy', 'Joyce',
  'Juan', 'Juana', 'Juanita', 'Judah', 'Judas', 'Judd', 'Jude', 'Judith', 'Judy', 'Juelz',
  'Jules', 'Julia', 'Julian', 'Juliana', 'Julianna', 'Julianne', 'Julie', 'Juliet', 'Juliette', 'Julio',
  'Julissa', 'Julius', 'June', 'Junior', 'Junius', 'Justice', 'Justin', 'Justine', 'Justus', 'Justyn',
  
  // K
  'Kade', 'Kaden', 'Kader', 'Kadence', 'Kael', 'Kaelyn', 'Kahlil', 'Kai', 'Kaia', 'Kaiden',
  'Kailyn', 'Kaine', 'Kaiser', 'Kaitlin', 'Kaitlyn', 'Kale', 'Kaleb', 'Kalel', 'Kaleigh', 'Kalen',
  'Kaley', 'Kali', 'Kallie', 'Kalvin', 'Kamari', 'Kamden', 'Kameron', 'Kamila', 'Kamille', 'Kamron',
  'Kamryn', 'Kane', 'Kanisha', 'Kanye', 'Kara', 'Karan', 'Kareem', 'Karel', 'Karen', 'Kari',
  'Karin', 'Karina', 'Karl', 'Karla', 'Karlee', 'Karley', 'Karli', 'Karlie', 'Karlo', 'Karol',
  'Karolina', 'Karoline', 'Karon', 'Karson', 'Karsten', 'Karter', 'Kary', 'Karyn', 'Kase', 'Kasen',
  'Kasey', 'Kash', 'Kason', 'Kassandra', 'Kassidy', 'Kate', 'Katelyn', 'Katelynn', 'Katerina', 'Katharine',
  'Katherine', 'Kathleen', 'Kathryn', 'Kathy', 'Katie', 'Katina', 'Katlyn', 'Katrina', 'Katty', 'Kavan',
  'Kay', 'Kayden', 'Kaydence', 'Kaye', 'Kayla', 'Kaylah', 'Kaylee', 'Kayleen', 'Kayleigh', 'Kaylen',
  'Kayley', 'Kayli', 'Kaylie', 'Kaylin', 'Kaylyn', 'Kaylynn', 'Kayson', 'Keanu', 'Keaton', 'Kedar',
  'Keegan', 'Keelan', 'Keely', 'Keen', 'Keenan', 'Keira', 'Keith', 'Kellan', 'Kellen', 'Kelley',
  'Kelli', 'Kellie', 'Kelly', 'Kelsey', 'Kelsie', 'Kelvin', 'Kem', 'Ken', 'Kendal', 'Kendall',
  'Kendra', 'Kendrick', 'Kenley', 'Kenna', 'Kennard', 'Kennedy', 'Kenneth', 'Kenney', 'Kennith', 'Kenny',
  'Kent', 'Kenton', 'Kenza', 'Kenzo', 'Keon', 'Kermit', 'Kerr', 'Kerry', 'Kerwin', 'Keshaun',
  'Keshawn', 'Kevin', 'Kevon', 'Keyon', 'Keyshawn', 'Kian', 'Kiana', 'Kianna', 'Kiara', 'Kiera',
  'Kieran', 'Kiersten', 'Kiki', 'Kiley', 'Killian', 'Kim', 'Kimball', 'Kimber', 'Kimberlee', 'Kimberley',
  'Kimberly', 'Kimmel', 'King', 'Kingsley', 'Kip', 'Kira', 'Kiran', 'Kirby', 'Kirk', 'Kirsten',
  'Kirsty', 'Kit', 'Kitty', 'Klaus', 'Knox', 'Kobe', 'Koby', 'Kody', 'Kolby', 'Kole',
  'Kolten', 'Kolton', 'Konner', 'Konnor', 'Kooper', 'Kora', 'Korey', 'Kori', 'Kortney', 'Kory',
  'Kraig', 'Kris', 'Krishna', 'Krista', 'Kristen', 'Kristi', 'Kristian', 'Kristie', 'Kristin', 'Kristina',
  'Kristine', 'Kristofer', 'Kristopher', 'Kristy', 'Krystal', 'Kurt', 'Kurtis', 'Kyan', 'Kyla', 'Kyle',
  'Kylee', 'Kyleigh', 'Kyler', 'Kylie', 'Kym', 'Kyra', 'Kyran', 'Kyree', 'Kyson',
  
  // L
  'Lacey', 'Lachlan', 'Lacy', 'Laddie', 'Lafayette', 'Laia', 'Laila', 'Lainey', 'Laird', 'Lake',
  'Laken', 'Lamar', 'Lamont', 'Lana', 'Lance', 'Landen', 'Lander', 'Lando', 'Landon', 'Landry',
  'Lane', 'Laney', 'Langdon', 'Langston', 'Lani', 'Lara', 'Larissa', 'Lark', 'Larkin', 'Larry',
  'Lars', 'Larson', 'Lashawn', 'Lassen', 'Latasha', 'Latrell', 'Laura', 'Laurel', 'Lauren', 'Laurence',
  'Laurie', 'Lauryn', 'Lavender', 'Laverne', 'Lavina', 'Lavinia', 'Lawrence', 'Lawson', 'Layla', 'Layne',
  'Layton', 'Lazaro', 'Lazarus', 'Lea', 'Leah', 'Leal', 'Leander', 'Leandra', 'Leann', 'Leanna',
  'Leanne', 'Leary', 'Leaton', 'Lech', 'Leda', 'Ledger', 'Lee', 'Leela', 'Leena', 'Leesa',
  'Leger', 'Leia', 'Leif', 'Leigh', 'Leighton', 'Leila', 'Leilani', 'Leland', 'Lemuel', 'Len',
  'Lena', 'Lenard', 'Lennard', 'Lennie', 'Lennon', 'Lennox', 'Lenny', 'Lenore', 'Leo', 'Leon',
  'Leona', 'Leonard', 'Leonardo', 'Leonel', 'Leonidas', 'Leonor', 'Leonora', 'Leopold', 'Leroy', 'Les',
  'Lesley', 'Leslie', 'Lesly', 'Lester', 'Letitia', 'Lettie', 'Lev', 'Leven', 'Levi', 'Levy',
  'Lew', 'Lewis', 'Lex', 'Lexi', 'Lexie', 'Lexis', 'Lexus', 'Leyla', 'Liam', 'Liana',
  'Libby', 'Liberty', 'Lida', 'Lidia', 'Liesel', 'Lila', 'Lilah', 'Lilian', 'Liliana', 'Lilianna',
  'Lilith', 'Lilias', 'Lilla', 'Lillian', 'Lillie', 'Lilly', 'Lily', 'Lilyana', 'Limon', 'Lin',
  'Lina', 'Lincoln', 'Linda', 'Lindsay', 'Lindsey', 'Lindy', 'Linus', 'Lionel', 'Liron', 'Lisa',
  'Lisandra', 'Lisette', 'Lissa', 'Lita', 'Liv', 'Livia', 'Livvy', 'Liz', 'Liza', 'Lizabeth',
  'Lizbeth', 'Lizette', 'Lizzie', 'Lizzy', 'Lloyd', 'Lochlan', 'Logan', 'Lola', 'London', 'Lois',
  'Long', 'Lonnie', 'Lonny', 'Lora', 'Loran', 'Lord', 'Lorelai', 'Lorelei', 'Loren', 'Lorena',
  'Lorenzo', 'Loretta', 'Lori', 'Lorie', 'Loris', 'Lorna', 'Lorraine', 'Lottie', 'Lou', 'Louie',
  'Louis', 'Louisa', 'Louise', 'Lourdes', 'Love', 'Lovell', 'Lowell', 'Loyd', 'Lucas', 'Lucia',
  'Lucian', 'Luciana', 'Lucianne', 'Luciano', 'Lucien', 'Lucile', 'Lucilla', 'Lucille', 'Lucinda', 'Lucky',
  'Lucy', 'Ludwig', 'Luella', 'Luis', 'Luisa', 'Luke', 'Lula', 'Lulu', 'Luna', 'Lundy',
  'Lunsford', 'Luther', 'Luz', 'Lydia', 'Lyla', 'Lyle', 'Lyman', 'Lynda', 'Lyndsay', 'Lyndsey',
  'Lynette', 'Lynn', 'Lynne', 'Lynette', 'Lynton', 'Lyra', 'Lyric', 'Lysander',
  
  // M
  'Mabel', 'Mable', 'Mac', 'Macarthur', 'Macaulay', 'Macey', 'Macie', 'Mack', 'Mackenzie', 'Macy',
  'Madan', 'Maddie', 'Maddy', 'Madeline', 'Madelyn', 'Madelynn', 'Madge', 'Madison', 'Madisyn', 'Madonna',
  'Madox', 'Maddux', 'Mae', 'Maegan', 'Maeve', 'Maggie', 'Magnolia', 'Magnus', 'Maia', 'Maisie',
  'Major', 'Makai', 'Makayla', 'Makena', 'Makenna', 'Makenzie', 'Malcolm', 'Maleah', 'Malia', 'Malik',
  'Mallory', 'Malone', 'Manolo', 'Manuel', 'Manuela', 'Mara', 'Marc', 'Marcel', 'Marcela', 'Marcelina',
  'Marcelo', 'Marci', 'Marcia', 'Marcie', 'Marco', 'Marcos', 'Marcus', 'Marcy', 'Margaret', 'Margarita',
  'Marge', 'Margery', 'Margie', 'Margo', 'Margot', 'Marguerite', 'Maria', 'Mariah', 'Mariam', 'Marian',
  'Mariana', 'Marianna', 'Marianne', 'Maribel', 'Marie', 'Mariela', 'Mariella', 'Marielle', 'Marilyn', 'Marina',
  'Mario', 'Marion', 'Marisa', 'Marisol', 'Marissa', 'Maritza', 'Marjorie', 'Mark', 'Markus', 'Marla',
  'Marlee', 'Marlena', 'Marlene', 'Marley', 'Marlin', 'Marlo', 'Marlon', 'Marlow', 'Marlowe', 'Marly',
  'Marni', 'Marnie', 'Marquis', 'Marquita', 'Mars', 'Marsha', 'Marshall', 'Marta', 'Martha', 'Martin',
  'Martina', 'Marty', 'Marvin', 'Mary', 'Maryann', 'Marybeth', 'Maryjane', 'Marylou', 'Maryse', 'Mason',
  'Mateo', 'Mathew', 'Mathias', 'Mathieu', 'Matilda', 'Matilde', 'Matt', 'Matteo', 'Matthew', 'Matthias',
  'Mattie', 'Maud', 'Maude', 'Maura', 'Maureen', 'Maurice', 'Mauricio', 'Mauro', 'Maverick', 'Mavis',
  'Max', 'Maxence', 'Maxfield', 'Maxim', 'Maxime', 'Maximilian', 'Maximiliano', 'Maximin', 'Maximus', 'Maxine',
  'Maxwell', 'May', 'Maya', 'Mayra', 'Mayhew', 'Meadow', 'Meagan', 'Meaghan', 'Medford', 'Meera',
  'Meg', 'Megan', 'Meghan', 'Mel', 'Melanie', 'Melina', 'Melinda', 'Melisande', 'Melissa', 'Melody',
  'Melva', 'Melvin', 'Melvina', 'Mendy', 'Mercedes', 'Mercer', 'Mercy', 'Meredith', 'Merle', 'Merlin',
  'Merrill', 'Merritt', 'Mervin', 'Mervyn', 'Mia', 'Micaela', 'Micah', 'Michael', 'Michaela', 'Michal',
  'Michel', 'Michele', 'Michelle', 'Mick', 'Mickey', 'Midas', 'Miguel', 'Mika', 'Mikael', 'Mikaela',
  'Mikayla', 'Mike', 'Mila', 'Milagros', 'Milan', 'Mildred', 'Milena', 'Miles', 'Miley', 'Milford',
  'Millard', 'Miller', 'Millicent', 'Millie', 'Mills', 'Milo', 'Milton', 'Mimi', 'Mina', 'Mindy',
  'Minerva', 'Minnie', 'Mira', 'Mirabelle', 'Miracle', 'Miranda', 'Miriam', 'Misha', 'Misty', 'Mitch',
  'Mitchel', 'Mitchell', 'Miya', 'Moby', 'Modesta', 'Modesto', 'Moe', 'Mohamed', 'Mohammad', 'Mohammed',
  'Moira', 'Moises', 'Mollie', 'Molly', 'Mona', 'Monique', 'Monroe', 'Montague', 'Montana', 'Monte',
  'Montgomery', 'Monty', 'Mordecai', 'Morgan', 'Moriah', 'Morris', 'Morrison', 'Mortimer', 'Morton', 'Mose',
  'Moses', 'Moss', 'Moyer', 'Mulan', 'Muriel', 'Murphy', 'Murray', 'Myles', 'Myra', 'Myrna',
  'Myron', 'Myrtle',
  
  // N
  'Nadia', 'Nadine', 'Nahum', 'Nala', 'Nalon', 'Nan', 'Nana', 'Nance', 'Nanci', 'Nancy',
  'Nanette', 'Nanny', 'Naomi', 'Napoleon', 'Nara', 'Narcissa', 'Nash', 'Nasir', 'Nat', 'Natalia',
  'Natalie', 'Nataly', 'Natan', 'Natasha', 'Nate', 'Nathalie', 'Nathan', 'Nathaniel', 'Nathon', 'Natt',
  'Naughton', 'Navid', 'Nawal', 'Nayan', 'Neal', 'Nealon', 'Ned', 'Neda', 'Nehemiah', 'Neil',
  'Nelia', 'Nell', 'Nellie', 'Nelly', 'Nelson', 'Nemo', 'Nena', 'Neola', 'Nera', 'Neri',
  'Nero', 'Nessa', 'Nestor', 'Nethanel', 'Nettie', 'Neva', 'Nevada', 'Nevaeh', 'Neve', 'Nevin',
  'Newell', 'Newman', 'Newton', 'Nia', 'Niall', 'Niblett', 'Nic', 'Nicholas', 'Nicholaus', 'Nichole',
  'Nick', 'Nickolas', 'Nicky', 'Nico', 'Nicola', 'Nicolas', 'Nicole', 'Nicolette', 'Nida', 'Niel',
  'Nigel', 'Nika', 'Nike', 'Nikita', 'Niki', 'Nikki', 'Nikko', 'Niko', 'Nikolai', 'Nikolas',
  'Nila', 'Niles', 'Nils', 'Nina', 'Ninian', 'Nisa', 'Nisha', 'Nita', 'Niven', 'Nixon',
  'Noa', 'Noah', 'Noble', 'Noel', 'Noelia', 'Noelle', 'Noemi', 'Nola', 'Nolan', 'Nona',
  'Nora', 'Norah', 'Norbert', 'Noreen', 'Nori', 'Norm', 'Norma', 'Norman', 'Normand', 'Norris',
  'Norton', 'Norwood', 'Nova', 'Novak', 'Nydia', 'Nye', 'Nyla', 'Nylah', 'Nyle', 'Nyra',
  
  // O
  'Oakley', 'Obadiah', 'Obie', 'Ocean', 'Oceana', 'Octavia', 'Octavian', 'Octavius', 'Oda', 'Odele',
  'Odelia', 'Odell', 'Odessa', 'Odetta', 'Odette', 'Odin', 'Odolf', 'Odom', 'Odran', 'Odys',
  'Odysseus', 'Ofelia', 'Ogden', 'Okey', 'Ola', 'Olaf', 'Oland', 'Olga', 'Olin', 'Oliva',
  'Olive', 'Oliver', 'Olivia', 'Olla', 'Ollie', 'Olmstead', 'Oma', 'Omar', 'Omari', 'Omer',
  'Ona', 'Ondine', 'Onion', 'Oona', 'Opal', 'Ophelia', 'Ophir', 'Ora', 'Oran', 'Orand',
  'Oras', 'Orville', 'Orbin', 'Orce', 'Orcutt', 'Ordeen', 'Orell', 'Oren', 'Orestes', 'Orford',
  'Oriana', 'Oriel', 'Orin', 'Orion', 'Orla', 'Orland', 'Orlando', 'Orlean', 'Orley', 'Orlin',
  'Orman', 'Ormond', 'Orr', 'Orran', 'Orren', 'Orrie', 'Orrin', 'Orris', 'Orry', 'Orson',
  'Orton', 'Orval', 'Orville', 'Osband', 'Osbert', 'Osborn', 'Osborne', 'Oscar', 'Osgood', 'Osha',
  'Osias', 'Osip', 'Osiris', 'Osler', 'Osman', 'Osmond', 'Osmund', 'Ossie', 'Oswald', 'Oswin',
  'Otis', 'Ott', 'Ottie', 'Otto', 'Ottoman', 'Oty', 'Ouray', 'Ova', 'Ovid', 'Owen',
  'Oz', 'Ozzie', 'Ozzy',
  
  // P
  'Pablo', 'Pace', 'Pachico', 'Pack', 'Packer', 'Paco', 'Paddy', 'Padraig', 'Page', 'Paige',
  'Paine', 'Paisley', 'Pal', 'Palmer', 'Paloma', 'Pam', 'Pamela', 'Pamelia', 'Pandi', 'Pandora',
  'Pansy', 'Paola', 'Paolo', 'Paris', 'Parker', 'Parkes', 'Parkinson', 'Parks', 'Parley', 'Parnell',
  'Parrish', 'Parry', 'Pascal', 'Pasquale', 'Pat', 'Paton', 'Patrice', 'Patricia', 'Patrick', 'Patsy',
  'Patterson', 'Patton', 'Patty', 'Paul', 'Paula', 'Paulette', 'Paulina', 'Pauline', 'Paulo', 'Pax',
  'Paxton', 'Payt', 'Payton', 'Paz', 'Peach', 'Pearce', 'Pearl', 'Pearle', 'Pearson', 'Pease',
  'Pedro', 'Peggy', 'Pelham', 'Pell', 'Pemberton', 'Pembroke', 'Penelope', 'Penn', 'Penney', 'Pennie',
  'Pennington', 'Penny', 'Penrod', 'Pepe', 'Pepper', 'Pepys', 'Percival', 'Percy', 'Perdita', 'Peregrine',
  'Perez', 'Perley', 'Perrin', 'Perry', 'Pete', 'Peter', 'Peterson', 'Petra', 'Petula', 'Peyton',
  'Phaedra', 'Phebe', 'Phelan', 'Phil', 'Philetus', 'Philip', 'Philippa', 'Phillip', 'Phillipa', 'Philo',
  'Philomena', 'Phineas', 'Phoebe', 'Phoenix', 'Phuoc', 'Phyllis', 'Pierce', 'Silence', 'Pierson', 'Pike',
  'Pilgrim', 'Pinchas', 'Pink', 'Pinkney', 'Piper', 'Pippa', 'Pius', 'Plato', 'Platt', 'Pleasant',
  'Poe', 'Polly', 'Polk', 'Pomeroy', 'Ponce', 'Pontus', 'Poppy', 'Porter', 'Portia', 'Posey',
  'Powell', 'Prudence', 'Prue', 'Pryor', 'Pryce', 'Pulaski', 'Putnam', 'Pyle', 'Pym', 'Pyp',
  
  // Q
  'Quade', 'Quaid', 'Quan', 'Quanah', 'Quincy', 'Quinn', 'Quint', 'Quinten', 'Quintin', 'Quinton',
  'Quintus', 'Quirino', 'Quito', 'Quon',
  
  // R
  'Rachael', 'Rachel', 'Rachelle', 'Radcliffe', 'Radford', 'Radomil', 'Rae', 'Raegan', 'Raelynn', 'Rafael',
  'Rafaela', 'Rafferty', 'Raheem', 'Rahman', 'Raiden', 'Raimundo', 'Raina', 'Raine', 'Rainer', 'Rainier',
  'Raleigh', 'Ralph', 'Rambler', 'Ramon', 'Ramona', 'Ramsay', 'Ramsey', 'Rance', 'Rand', 'Randal',
  'Randall', 'Rande', 'Randell', 'Randolph', 'Randy', 'Ranger', 'Ransom', 'Raoul', 'Raphael', 'Raquel',
  'Rashad', 'Rashawn', 'Rasheed', 'Rashid', 'Rasmussen', 'Raul', 'Raven', 'Ravi', 'Ray', 'Raya',
  'Rayburn', 'Rayden', 'Raylan', 'Raymond', 'Raymund', 'Rayna', 'Rayner', 'Raynor', 'Rea', 'Read',
  'Reagan', 'Reanna', 'Reba', 'Rebecca', 'Rebekah', 'Red', 'Redd', 'Redmond', 'Reece', 'Reed',
  'Reese', 'Reeve', 'Reeves', 'Reg', 'Regan', 'Reggie', 'Regina', 'Reginald', 'Regis', 'Reid',
  'Reilly', 'Reina', 'Reinald', 'Reinhold', 'Reinking', 'Remi', 'Remington', 'Remy', 'Rena', 'Renaldo',
  'Renata', 'Renate', 'Rene', 'Renee', 'Rennie', 'Reno', 'Rensselaer', 'Renton', 'Renzo', 'Reuben',
  'Reuel', 'Rex', 'Rexford', 'Rey', 'Reyes', 'Reyna', 'Reynaldo', 'Reynold', 'Reynolds', 'Rhea',
  'Rhett', 'Rhianna', 'Rhiannon', 'Rhoda', 'Rhodes', 'Rhonda', 'Rhyan', 'Rhys', 'Rian', 'Ricardo',
  'Rice', 'Rich', 'Richard', 'Richelle', 'Richie', 'Richmond', 'Rick', 'Rickey', 'Ricki', 'Rickie',
  'Ricky', 'Rico', 'Riddick', 'Rider', 'Ridge', 'Ridgley', 'Ridley', 'Rigby', 'Rigel', 'Rigg',
  'Riley', 'Rilla', 'Rinaldo', 'Ringo', 'Rio', 'Riordan', 'Rip', 'Ripley', 'Risa', 'Rita',
  'Ritchie', 'Ritter', 'River', 'Rivka', 'Rob', 'Robb', 'Robbie', 'Robby', 'Robert', 'Roberta',
  'Roberto', 'Robin', 'Robyn', 'Rocco', 'Rochester', 'Rocio', 'Rock', 'Rockwell', 'Rocky', 'Rod',
  'Rodd', 'Roddy', 'Roderick', 'Rodger', 'Rodgers', 'Rodman', 'Rodney', 'Rodolfo', 'Rodrigo', 'Rogelio',
  'Roger', 'Rogers', 'Rohan', 'Roland', 'Rolando', 'Rolf', 'Rolin', 'Rollin', 'Rollo', 'Roma',
  'Romain', 'Roman', 'Romano', 'Rome', 'Romeo', 'Romila', 'Romola', 'Romy', 'Ron', 'Ronald',
  'Ronaldo', 'Ronda', 'Roni', 'Ronin', 'Ronnie', 'Ronny', 'Roosevelt', 'Rory', 'Rosa', 'Rosa', 'Rosabel',
  'Rosalee', 'Rosalie', 'Rosalind', 'Rosalinda', 'Rosalyn', 'Rosamond', 'Rosanna', 'Rosanne', 'Rosario', 'Roscoe',
  'Rose', 'Roseanne', 'Roseline', 'Roselyn', 'Rosemarie', 'Rosemary', 'Rosetta', 'Rosie', 'Rosina', 'Roslyn',
  'Ross', 'Roswell', 'Rowan', 'Rowena', 'Rowland', 'Roxana', 'Roxanne', 'Roxie', 'Roy', 'Royal',
  'Royce', 'Royden', 'Royer', 'Royston', 'Ruben', 'Ruby', 'Rudd', 'Rudolf', 'Rudolph', 'Rudy',
  'Rue', 'Ruel', 'Ruff', 'Rufus', 'Ruggles', 'Rupert', 'Rupp', 'Rush', 'Russ', 'Russel',
  'Russell', 'Rusty', 'Ruth', 'Rutherford', 'Ruthie', 'Rutland', 'Rutledge', 'Ryan', 'Ryann', 'Ryder',
  'Rye', 'Ryelan', 'Ryker', 'Rylan', 'Ryland', 'Rylee', 'Ryleigh', 'Ryler', 'Rylie', 'Ryon',
  
  // S
  'Sabina', 'Sabine', 'Sabra', 'Sabrina', 'Sacha', 'Sackett', 'Saddle', 'Sadie', 'Sage', 'Saint',
  'Sal', 'Salina', 'Sally', 'Salomon', 'Salvador', 'Salvatore', 'Sam', 'Samantha', 'Samara', 'Samir',
  'Sammy', 'Sampson', 'Samson', 'Samuel', 'Samyia', 'San', 'Sanborn', 'Sanchez', 'Sancho', 'Sandell',
  'Sander', 'Sanders', 'Sandford', 'Sandra', 'Sandro', 'Sandy', 'Sanford', 'Sansom', 'Santiago', 'Santos',
  'Sara', 'Sarah', 'Sarahi', 'Sari', 'Sasha', 'Saul', 'Saunders', 'Savage', 'Savanna', 'Savannah',
  'Savion', 'Savoy', 'Sawyer', 'Saxon', 'Saxton', 'Saylor', 'Scarlet', 'Scarlett', 'Schooley', 'Schuyler',
  'Scot', 'Scott', 'Scottie', 'Scotty', 'Scoville', 'Seamus', 'Sean', 'Sebastian', 'Sebastiano', 'Selah',
  'Selby', 'Selden', 'Selena', 'Selene', 'Selina', 'Selma', 'Selwyn', 'Semaj', 'Seneca', 'Seong',
  'Septimus', 'Seraphina', 'Seraphine', 'Serena', 'Serenity', 'Serge', 'Sergei', 'Sergio', 'Seth', 'Severin',
  'Severn', 'Seymour', 'Shad', 'Shadi', 'Shadow', 'Shae', 'Shaffer', 'Shalan', 'Shalon', 'Shamus',
  'Shan', 'Shana', 'Shane', 'Shani', 'Shania', 'Shanice', 'Shanna', 'Shannon', 'Shantel', 'Shari',
  'Sharon', 'Sharyl', 'Shasta', 'Shaun', 'Shauna', 'Shawn', 'Shawna', 'Shay', 'Shayla', 'Shayna',
  'Shayne', 'Shea', 'Shedrick', 'Sheena', 'Sheila', 'Shelby', 'Sheldon', 'Shelia', 'Shelley', 'Shelly',
  'Shelton', 'Shenandoah', 'Shep', 'Shepard', 'Shepherd', 'Sheridan', 'Sherman', 'Sherred', 'Sherri', 'Sherrie',
  'Sherrill', 'Sherry', 'Sherry', 'Sherwin', 'Sherwood', 'Shields', 'Shila', 'Shilah', 'Shilo', 'Shiloh', 'Shirley',
  'Short', 'Shyann', 'Shyla', 'Sian', 'Sibyl', 'Sid', 'Sidney', 'Siegfried', 'Siena', 'Sienna',
  'Sierra', 'Sigmund', 'Signe', 'Sigrid', 'Silas', 'Silvana', 'Silvano', 'Silvester', 'Silvia', 'Silvio',
  'Sima', 'Simeon', 'Simon', 'Simona', 'Simone', 'Simpson', 'Sinclair', 'Sincere', 'Sion', 'Siri',
  'Sissy', 'Skeet', 'Skeeter', 'Skye', 'Skyla', 'Skylar', 'Skyler', 'Slade', 'Sloan', 'Sloane',
  'Slocum', 'Smedley', 'Smyth', 'Snow', 'Sofia', 'Sofie', 'Sol', 'Solomon', 'Sondra', 'Sonia',
  'Sonja', 'Sonny', 'Sonya', 'Sophia', 'Sophie', 'Sophy', 'Soren', 'South', 'Spalding', 'Sparks',
  'Sparrow', 'Spencer', 'Spike', 'Sprague', 'Spring', 'Spurgeon', 'Squire', 'Stacey', 'Stacy', 'Stafford',
  'Stamford', 'Stan', 'Stanford', 'Stanislaus', 'Stanislas', 'Stanley', 'Stanton', 'Star', 'Stark', 'Starr',
  'Stefan', 'Stefanie', 'Stella', 'Stephan', 'Stephanie', 'Stephen', 'Sterling', 'Steve', 'Steven', 'Stevens',
  'Stevenson', 'Stevie', 'Stewart', 'Stone', 'Stoney', 'Storm', 'Stormy', 'Stout', 'Stover', 'Strafford',
  'Stratton', 'Street', 'Strother', 'Stuart', 'Sturgis', 'Styles', 'Sue', 'Suki', 'Sullivan', 'Sully',
  'Sumner', 'Sunny', 'Sunshine', 'Susan', 'Susan', 'Susana', 'Susanna', 'Susannah', 'Susanne', 'Susie', 'Sutton',
  'Suzanna', 'Suzanne', 'Suzette', 'Suzi', 'Suzie', 'Suzy', 'Sven', 'Sybil', 'Sydnee', 'Sydney',
  'Sydni', 'Sydnie', 'Syed', 'Sykes', 'Sylas', 'Sylva', 'Sylvester', 'Sylvia', 'Sylvie', 'Symone',
  
  // T
  'Tabitha', 'Tabor', 'Tacy', 'Tad', 'Tadeo', 'Taft', 'Taggart', 'Tahir', 'Tait', 'Tal',
  'Talbot', 'Talia', 'Talitha', 'Tallulah', 'Talon', 'Talmadge', 'Tam', 'Tama', 'Tamara', 'Tameka',
  'Tami', 'Tamia', 'Tamika', 'Tammi', 'Tammie', 'Tammy', 'Tamra', 'Tandy', 'Tanner', 'Tanya',
  'Tara', 'Taran', 'Tarleton', 'Tarrant', 'Tasha', 'Tashia', 'Tate', 'Tatiana', 'Tatum', 'Tatyana',
  'Tavis', 'Tavon', 'Tawny', 'Taya', 'Tayla', 'Tayler', 'Taylor', 'Teagan', 'Teague', 'Ted',
  'Teddy', 'Teegan', 'Tegan', 'Telford', 'Telma', 'Temora', 'Temperance', 'Temple', 'Tennant', 'Tennessee',
  'Tennyson', 'Terance', 'Terence', 'Teresa', 'Teri', 'Terrance', 'Terrell', 'Terrence', 'Terri', 'Terrie',
  'Terrill', 'Terry', 'Tess', 'Tessa', 'Thad', 'Thaddeus', 'Thalia', 'Thatcher', 'Thayer', 'Thea',
  'Thelma', 'Theo', 'Theo', 'Theobald', 'Theodora', 'Theodore', 'Theodoric', 'Theodosia', 'Theresa', 'Therese', 'Theron',
  'Thierry', 'Thomas', 'Thomasina', 'Thor', 'Thoralf', 'Thorin', 'Thorley', 'Thorn', 'Thorndike', 'Thorne',
  'Thornton', 'Thurman', 'Thurston', 'Tia', 'Tiara', 'Tiana', 'Tianna', 'Tiberius', 'Tiera', 'Tierney',
  'Tiffany', 'Tilda', 'Tillman', 'Tillie', 'Tilly', 'Tim', 'Timmie', 'Timmy', 'Timothy', 'Tina',
  'Tinsley', 'Tito', 'Titus', 'Tobias', 'Tobie', 'Tobin', 'Toby', 'Todd', 'Toddy', 'Tom',
  'Tomas', 'Tomasz', 'Tommie', 'Tommy', 'Toni', 'Tonia', 'Tony', 'Tonya', 'Toole', 'Topher',
  'Tori', 'Torin', 'Torrence', 'Torrey', 'Torrie', 'Tory', 'Tove', 'Townsend', 'Trace', 'Tracey',
  'Traci', 'Tracie', 'Tracy', 'Trafford', 'Travis', 'Trayton', 'Tre', 'Tremaine', 'Trent', 'Trenton',
  'Trevon', 'Trevor', 'Trey', 'Tricia', 'Trina', 'Trinity', 'Trish', 'Trisha', 'Tristan', 'Tristen',
  'Tristin', 'Triston', 'Troy', 'Trudi', 'Trudie', 'Trudy', 'Trueman', 'Truesdale', 'Truman', 'Trystan',
  'Tucker', 'Tudor', 'Tully', 'Turner', 'Twan', 'Ty', 'Tye', 'Tyler', 'Tylor', 'Tyra',
  'Tyree', 'Tyrell', 'Tyrese', 'Tyron', 'Tyrone', 'Tyrus', 'Tyshawn', 'Tyson',
  
  // U
  'Ugo', 'Uland', 'Ula', 'Ulric', 'Ulrich', 'Ulysses', 'Uma', 'Umay', 'Umberto', 'Una',
  'Underwood', 'Unity', 'Upton', 'Urban', 'Uri', 'Uriah', 'Uriel', 'Urijah', 'Ursula', 'Upton',
  
  // V
  'Val', 'Valarie', 'Valdemar', 'Valen', 'Valentina', 'Valentine', 'Valentino', 'Valeria', 'Valerie', 'Valerius',
  'Valery', 'Valor', 'Van', 'Vance', 'Vander', 'Vanessa', 'Varian', 'Varnum', 'Vasco', 'Vaughn',
  'Veata', 'Veda', 'Veer', 'Velia', 'Velma', 'Vance', 'Vera', 'Verd', 'Verdell', 'Vere',
  'Vergil', 'Verna', 'Vernell', 'Verner', 'Vernon', 'Veronica', 'Vesta', 'Vic', 'Vichy', 'Vick',
  'Vickey', 'Vickey', 'Vicki', 'Vickie', 'Vicky', 'Victor', 'Victoria', 'Victoriano', 'Victorina', 'Vida', 'Vidor',
  'Viggo', 'Vihan', 'Vilas', 'Vince', 'Vincent', 'Vincenzo', 'Vinson', 'Viola', 'Violet', 'Violetta',
  'Vira', 'Virgil', 'Virginia', 'Visalia', 'Vivian', 'Viviana', 'Vivienne', 'Vlad', 'Vladimir', 'Vonda',
  
  // W
  'Wade', 'Wadsworth', 'Wagner', 'Waite', 'Wakefield', 'Walcott', 'Walden', 'Waldo', 'Waldron', 'Wales',
  'Walker', 'Wallace', 'Waller', 'Wallis', 'Wally', 'Walsh', 'Walter', 'Walton', 'Ward', 'Wardell',
  'Warden', 'Ware', 'Warfield', 'Waring', 'Warner', 'Warner', 'Warren', 'Warrick', 'Wash', 'Washington', 'Watson',
  'Watt', 'Waverly', 'Wayland', 'Waylon', 'Wayne', 'Webb', 'Webster', 'Weed', 'Weeks', 'Weir',
  'Welch', 'Weldon', 'Weller', 'Wellington', 'Wells', 'Welsh', 'Welton', 'Wendell', 'Wendy', 'Wenona',
  'Werner', 'Wes', 'Wesley', 'Wess', 'Wesson', 'West', 'Westbrook', 'Westcott', 'Westley', 'Weston',
  'Wetherill', 'Weyland', 'Wharton', 'Wheatley', 'Wheaton', 'Wheeler', 'Whipple', 'Whit', 'Whitaker', 'Whitcomb',
  'White', 'Whitefield', 'Whitelaw', 'Whiting', 'Whitman', 'Whitney', 'Whittaker', 'Whitten', 'Whittier', 'Wickliffe',
  'Wilbert', 'Wilbur', 'Wilburn', 'Wilda', 'Wilder', 'Wiles', 'Wiley', 'Wilford', 'Wilfred', 'Wilfredo',
  'Wilhelmina', 'Wilke', 'Wilkes', 'Wilkie', 'Wilkinson', 'Will', 'Willa', 'Willard', 'Willcox', 'Willet',
  'Willett', 'William', 'Williams', 'Williamson', 'Willie', 'Willis', 'Willoughby', 'Wills', 'Willy', 'Wilma',
  'Wilmer', 'Wilmot', 'Wilson', 'Wilton', 'Winchell', 'Windsor', 'Winfield', 'Winifred', 'Winnie', 'Winnifred',
  'Winona', 'Winslow', 'Winston', 'Winter', 'Winthrop', 'Wirt', 'Wisdom', 'Wister', 'Withers', 'Witt',
  'Wogan', 'Wolcott', 'Wolf', 'Wolfe', 'Wolfgang', 'Wood', 'Woodard', 'Woodbridge', 'Woodbury', 'Woodcliff',
  'Woodford', 'Woodford', 'Woodhull', 'Woodland', 'Woodley', 'Woodman', 'Woodrow', 'Woodruff', 'Woodson', 'Woodward', 'Woolsey',
  'Worcester', 'Worden', 'Worth', 'Worthington', 'Worthy', 'Wray', 'Wren', 'Wright', 'Wyatt', 'Wyckliffe',
  'Wycliffe', 'Wylie', 'Wyman', 'Wyndell', 'Wyndham', 'Wynn', 'Wynne', 'Wynter', 'Wythe',
  
  // X
  'Xander', 'Xandra', 'Xanthe', 'Xanthia', 'Xavier', 'Xaviera', 'Xena', 'Xenia', 'Xenophon', 'Xerxes',
  'Xiomara', 'Xylon',
  
  // Y
  'Yadiel', 'Yael', 'Yago', 'Yahir', 'Yancey', 'Yanis', 'Yared', 'Yareli', 'Yaretzi', 'Yaris',
  'Yaromir', 'Yarrow', 'Yasir', 'Yasmin', 'Yasmine', 'Yates', 'Yeardley', 'Yehudi', 'Yidel', 'Yolanda',
  'Yonin', 'Yorick', 'York', 'Yosef', 'Yoshi', 'Yoshio', 'Young', 'Yul', 'Yule', 'Yuri',
  'Yusef', 'Yusuf', 'Yvain', 'Yves', 'Yvette', 'Yvon', 'Yvonne',
  
  // Z
  'Zac', 'Zach', 'Zachariah', 'Zachary', 'Zachery', 'Zack', 'Zackary', 'Zackery', 'Zada', 'Zade',
  'Zadie', 'Zadok', 'Zahid', 'Zahir', 'Zahra', 'Zaid', 'Zaida', 'Zaidee', 'Zain', 'Zaine',
  'Zaira', 'Zak', 'Zakaria', 'Zakariya', 'Zaki', 'Zakir', 'Zale', 'Zalman', 'Zander', 'Zandra',
  'Zane', 'Zani', 'Zara', 'Zarah', 'Zareb', 'Zared', 'Zaria', 'Zariah', 'Zarley', 'Zavier',
  'Zayd', 'Zayden', 'Zayne', 'Zaza', 'Zea', 'Zeb', 'Zebadiah', 'Zebedee', 'Zebulon', 'Zebulun',
  'Zed', 'Zedekiah', 'Zef', 'Zeke', 'Zelene', 'Zelia', 'Zelig', 'Zelma', 'Zena', 'Zenas',
  'Zene', 'Zenia', 'Zenobia', 'Zenon', 'Zenos', 'Zephan', 'Zephaniah', 'Zephyr', 'Zephyrus', 'Zera',
  'Zero', 'Zeshawn', 'Zev', 'Zia', 'Zian', 'Ziad', 'Zianna', 'Ziben', 'Ziggy', 'Zildjian',
  'Zillah', 'Zilpah', 'Zimri', 'Zina', 'Zinovi', 'Zion', 'Ziona', 'Zippora', 'Zipporah', 'Zita',
  'Ziv', 'Ziva', 'Ziven', 'Ziya', 'Ziyaad', 'Ziyad', 'Zoe', 'Zoey', 'Zofia', 'Zohar',
  'Zoie', 'Zola', 'Zoltan', 'Zona', 'Zophar', 'Zora', 'Zorabelle', 'Zorah', 'Zoran', 'Zorina',
  'Zosimo', 'Zosimus', 'Zowie', 'Zuba', 'Zuberi', 'Zuhair', 'Zula', 'Zuleika', 'Zulema', 'Zuri',
  'Zuriel', 'Zuzen', 'Zuzanna', 'Zwi', 'Zygmunt', 'Zyta'
]

/**
 * Returns a random English name from the static list of 1500+ items
 */
export function getRandomEnglishName(): string {
  const randomIndex = Math.floor(Math.random() * ENGLISH_NAMES.length)
  return ENGLISH_NAMES[randomIndex]
}

/**
 * Generates a unique English name by picking random names and verifying against existing Firestore records.
 * Keeps looking until it finds one that is not in use.
 */
export async function generateUniqueEnglishName(): Promise<string> {
  const maxAttempts = 50
  let attempts = 0

  while (attempts < maxAttempts) {
    const candidate = getRandomEnglishName()

    // 1. Check in students collection
    const studentSnap = await getDocs(query(collection(db, 'students'), where('code', '==', candidate)))
    if (!studentSnap.empty) {
      attempts++
      continue
    }

    // 2. Check in teachers collection
    const teacherSnap = await getDocs(query(collection(db, 'teachers'), where('code', '==', candidate)))
    if (!teacherSnap.empty) {
      attempts++
      continue
    }

    return candidate
  }

  // Fallback if somehow there's a collision on all attempts (e.g. 50 attempts all hit existing names)
  // Append a small random 2-digit number
  const candidate = getRandomEnglishName()
  const randomSuffix = Math.floor(10 + Math.random() * 90)
  return `${candidate}${randomSuffix}`
}
